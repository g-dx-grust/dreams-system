"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import ExcelJS from "exceljs";
import PizZip from "pizzip";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { type ActionResult, fail, ok } from "@/lib/result";
import { detectPlaceholdersInDocx } from "@/lib/transfer/detect-placeholders";
import { buildTransferContext } from "@/lib/transfer/context-builder";
import { preCheck } from "@/lib/transfer/precheck";
import type { Mapping } from "@/lib/transfer/engine";
import { isDebugTemplateDescription } from "@/lib/templates/check-template";
import { canonicalizeFieldPath, fieldLabel, suggestFieldEntry } from "@/lib/transfer/field-dict";
import {
  AI_MAPPING_MODEL_DEFAULT,
  AiMappingSuggestionSchema,
  TEMPLATE_MAPPING_SYSTEM_PROMPT,
  buildAiMappingPayload,
  normalizeAiMappingSuggestion,
  type TemplateMappingSuggestion,
} from "@/lib/templates/ai-mapping";
import { CASE_TYPES } from "@/lib/validators/case";

// ---- 型定義 ----

export type TemplateRow = {
  id: number;
  name: string;
  category_id: number;
  municipality_id: number | null;
  file_path: string;
  file_type: string;
  original_file_name: string | null;
  version: number;
  is_active: boolean;
  description: string | null;
  applicable_case_types: string[] | null;
  uploaded_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TemplateCategoryRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number | null;
};

export type LocationMunicipalityRow = {
  id: number;
  prefecture_id: number;
  name: string;
  code: string;
  display_order: number;
};

export type LocationPrefectureRow = {
  id: number;
  area_id: number;
  name: string;
  code: string;
  display_order: number;
  municipalities: LocationMunicipalityRow[];
};

export type LocationAreaRow = {
  id: number;
  name: string;
  code: string;
  display_order: number;
  prefectures: LocationPrefectureRow[];
};

export type TemplateLocationInfo = {
  area_id: number;
  area_name: string;
  prefecture_id: number;
  prefecture_name: string;
  municipality_id: number;
  municipality_name: string;
};

export type TemplateMappingRow = {
  id: number;
  template_id: number;
  placeholder: string;
  field_path: string;
  label: string | null;
  is_required: boolean | null;
  sort_order: number | null;
};

export type TemplateListRow = {
  id: number;
  name: string;
  category_id: number;
  municipality_id: number | null;
  file_type: string;
  version: number;
  is_active: boolean;
  applicable_case_types: string[] | null;
  created_at: string;
  updated_at: string;
  category_name: string;
  location_label: string | null;
  mapping_count: number;
};

export type TemplateGenerationOption = {
  id: number;
  name: string;
  file_type: string;
  version: number;
  category_name: string;
  location_label: string | null;
  mapping_count: number;
};

export type TemplateDetail = TemplateRow & {
  category: TemplateCategoryRow;
  mappings: TemplateMappingRow[];
  location: TemplateLocationInfo | null;
};

export type TemplatePreviewCell = {
  col: string;
  address: string;
  value: string;
};

export type TemplatePreviewRow = {
  number: number;
  cells: TemplatePreviewCell[];
};

export type TemplatePreviewSheet = {
  name: string;
  columns: string[];
  rows: TemplatePreviewRow[];
  truncated: boolean;
};

export type TemplatePreviewDocxPart =
  | { type: "text"; text: string }
  | { type: "placeholder"; key: string };

export type TemplatePreviewDocxBlock = {
  id: string;
  parts: TemplatePreviewDocxPart[];
};

export type TemplatePreview =
  | {
      fileType: "xlsx";
      sheets: TemplatePreviewSheet[];
      truncated: boolean;
    }
  | {
      fileType: "docx";
      blocks: TemplatePreviewDocxBlock[];
      placeholders: string[];
      truncated: boolean;
    };

// ---- バリデーション ----

const OptionalPositiveIdSchema = z.preprocess((value) => {
  if (value == null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}, z.coerce.number().int().positive().optional());

const TemplateMetaSchema = z.object({
  name: z.string().min(1, "様式名を入力してください").max(200),
  categoryId: z.coerce.number().int().positive("カテゴリを選択してください"),
  municipalityId: OptionalPositiveIdSchema,
  description: z.string().max(500).optional(),
  applicableCaseTypes: z.array(z.string()).optional(),
});

const MappingRowSchema = z.object({
  placeholder: z.string().min(1, "プレースホルダーを入力してください"),
  fieldPath: z.string().min(1, "フィールドパスを入力してください"),
  label: z.string().max(200).optional(),
  isRequired: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().optional(),
});

function normalizeMappingRow(
  mapping: Pick<
    TemplateMappingRow,
    "placeholder" | "field_path" | "label" | "is_required" | "sort_order"
  >,
) {
  const canonicalPath = canonicalizeFieldPath(mapping.field_path || mapping.placeholder);
  const suggested = suggestFieldEntry(mapping.field_path || mapping.placeholder);

  return {
    placeholder: mapping.placeholder,
    field_path: canonicalPath,
    label: mapping.label ?? suggested?.label ?? fieldLabel(canonicalPath),
    is_required: mapping.is_required ?? false,
    sort_order: mapping.sort_order ?? 0,
  };
}

function buildDetectedMappings(
  templateId: number,
  placeholders: string[],
  existingMappings: TemplateMappingRow[] = [],
) {
  const existingByPlaceholder = new Map(
    existingMappings.map((mapping) => [mapping.placeholder, mapping]),
  );
  const existingByCanonicalPlaceholder = new Map(
    existingMappings.map((mapping) => [canonicalizeFieldPath(mapping.placeholder), mapping]),
  );

  return placeholders.map((placeholder, index) => {
    const preserved =
      existingByPlaceholder.get(placeholder) ??
      existingByCanonicalPlaceholder.get(canonicalizeFieldPath(placeholder));

    const normalized = normalizeMappingRow({
      placeholder,
      field_path: preserved?.field_path ?? placeholder,
      label: preserved?.label ?? null,
      is_required: preserved?.is_required ?? false,
      sort_order: preserved?.sort_order ?? index,
    });

    return {
      template_id: templateId,
      ...normalized,
      label: normalized.label || null,
      sort_order: index,
    };
  });
}

async function fetchLocationAreas(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<LocationAreaRow[]> {
  const [areasRes, prefecturesRes, municipalitiesRes] = await Promise.all([
    supabase.from("location_areas").select("id, name, code, display_order").order("display_order"),
    supabase
      .from("location_prefectures")
      .select("id, area_id, name, code, display_order")
      .order("display_order"),
    supabase
      .from("location_municipalities")
      .select("id, prefecture_id, name, code, display_order")
      .order("display_order"),
  ]);

  if (areasRes.error || prefecturesRes.error || municipalitiesRes.error) {
    throw new Error("location master fetch failed");
  }

  const municipalitiesByPrefecture = new Map<number, LocationMunicipalityRow[]>();
  for (const municipality of (municipalitiesRes.data ?? []) as unknown as Omit<
    LocationMunicipalityRow,
    "municipalities"
  >[]) {
    const current = municipalitiesByPrefecture.get(municipality.prefecture_id) ?? [];
    current.push(municipality as LocationMunicipalityRow);
    municipalitiesByPrefecture.set(municipality.prefecture_id, current);
  }

  const prefecturesByArea = new Map<number, LocationPrefectureRow[]>();
  for (const prefecture of (prefecturesRes.data ?? []) as unknown as Array<
    Omit<LocationPrefectureRow, "municipalities">
  >) {
    const current = prefecturesByArea.get(prefecture.area_id) ?? [];
    current.push({
      ...prefecture,
      municipalities: municipalitiesByPrefecture.get(prefecture.id) ?? [],
    });
    prefecturesByArea.set(prefecture.area_id, current);
  }

  return ((areasRes.data ?? []) as Array<Omit<LocationAreaRow, "prefectures">>).map((area) => ({
    ...area,
    prefectures: prefecturesByArea.get(area.id) ?? [],
  }));
}

function buildLocationLookup(locationAreas: LocationAreaRow[]) {
  const lookup = new Map<number, TemplateLocationInfo>();

  for (const area of locationAreas) {
    for (const prefecture of area.prefectures) {
      for (const municipality of prefecture.municipalities) {
        lookup.set(municipality.id, {
          area_id: area.id,
          area_name: area.name,
          prefecture_id: prefecture.id,
          prefecture_name: prefecture.name,
          municipality_id: municipality.id,
          municipality_name: municipality.name,
        });
      }
    }
  }

  return lookup;
}

function formatLocationLabel(location: TemplateLocationInfo | null) {
  if (!location) return null;
  return `${location.area_name} / ${location.prefecture_name} / ${location.municipality_name}`;
}

function extractMappingCount(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return 0;
  const raw = (value[0] as { count?: number | string | null })?.count;
  const count = typeof raw === "string" ? Number(raw) : raw;
  return Number.isFinite(count) ? Number(count) : 0;
}

const XLSX_PREVIEW_MIN_ROWS = 20;
const XLSX_PREVIEW_MAX_ROWS = 80;
const XLSX_PREVIEW_MIN_COLUMNS = 8;
const XLSX_PREVIEW_MAX_COLUMNS = 40;
const DOCX_PREVIEW_MAX_BLOCKS = 90;
const DOCX_PREVIEW_MAX_TEXT_LENGTH = 6000;

const DOCX_PREVIEW_XMLS = [
  "word/document.xml",
  "word/header1.xml",
  "word/header2.xml",
  "word/header3.xml",
  "word/footer1.xml",
  "word/footer2.xml",
  "word/footer3.xml",
];

const DOCX_PLACEHOLDER_RE = /\{([^{}#/^][^{}]*)\}/g;

function columnNumberToName(columnNumber: number) {
  let value = columnNumber;
  let name = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
}

function formatExcelPreviewValue(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && value.result != null) return String(value.result);
    if ("formula" in value && value.formula != null) return String(value.formula);
    if ("error" in value && value.error != null) return String(value.error);
    return "";
  }

  return String(value);
}

function buildXlsxSheetPreview(sheet: ExcelJS.Worksheet): TemplatePreviewSheet {
  let maxRow = 0;
  let maxColumn = 0;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    maxRow = Math.max(maxRow, rowNumber);
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      if (formatExcelPreviewValue(cell.value).trim()) {
        maxColumn = Math.max(maxColumn, columnNumber);
      }
    });
  });

  const rowCount = Math.min(Math.max(maxRow, XLSX_PREVIEW_MIN_ROWS), XLSX_PREVIEW_MAX_ROWS);
  const columnCount = Math.min(
    Math.max(maxColumn, XLSX_PREVIEW_MIN_COLUMNS),
    XLSX_PREVIEW_MAX_COLUMNS,
  );
  const columns = Array.from({ length: columnCount }, (_, index) => columnNumberToName(index + 1));

  const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const rowNumber = rowIndex + 1;
    return {
      number: rowNumber,
      cells: columns.map((col, columnIndex) => ({
        col,
        address: `${col}${rowNumber}`,
        value: formatExcelPreviewValue(sheet.getCell(rowNumber, columnIndex + 1).value),
      })),
    };
  });

  return {
    name: sheet.name,
    columns,
    rows,
    truncated: maxRow > rowCount || maxColumn > columnCount,
  };
}

async function buildXlsxPreview(buffer: ArrayBuffer): Promise<TemplatePreview> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Buffer.from(buffer) as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0],
  );
  const sheets = workbook.worksheets.map(buildXlsxSheetPreview);

  return {
    fileType: "xlsx",
    sheets,
    truncated: sheets.some((sheet) => sheet.truncated),
  };
}

function decodeXmlText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function xmlToPlainText(xml: string) {
  return decodeXmlText(
    xml
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

function splitDocxPreviewParts(text: string): TemplatePreviewDocxPart[] {
  const parts: TemplatePreviewDocxPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(DOCX_PLACEHOLDER_RE)) {
    const raw = match[0];
    const key = match[1]?.trim();
    if (!raw || !key || match.index == null) continue;

    if (match.index > lastIndex) {
      parts.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "placeholder", key });
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", text: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", text }];
}

function buildDocxPreview(buffer: ArrayBuffer): TemplatePreview {
  const zip = new PizZip(buffer);
  const blocks: TemplatePreviewDocxBlock[] = [];
  const placeholders = new Set<string>();
  let textLength = 0;
  let truncated = false;

  for (const path of DOCX_PREVIEW_XMLS) {
    const file = zip.file(path);
    if (!file) continue;

    const xml = file.asText();
    const paragraphMatches = Array.from(xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g));
    const paragraphs = paragraphMatches.length > 0 ? paragraphMatches.map((m) => m[0]) : [xml];

    for (const paragraphXml of paragraphs) {
      const text = xmlToPlainText(paragraphXml).replace(/\s+/g, " ").trim();
      if (!text) continue;

      if (blocks.length >= DOCX_PREVIEW_MAX_BLOCKS || textLength >= DOCX_PREVIEW_MAX_TEXT_LENGTH) {
        truncated = true;
        break;
      }

      const parts = splitDocxPreviewParts(text);
      for (const part of parts) {
        if (part.type === "placeholder") placeholders.add(part.key);
      }
      blocks.push({
        id: `${path}:${blocks.length}`,
        parts,
      });
      textLength += text.length;
    }

    if (truncated) break;
  }

  return {
    fileType: "docx",
    blocks,
    placeholders: Array.from(placeholders).sort(),
    truncated,
  };
}

function isKnownCaseType(value: string | undefined): value is (typeof CASE_TYPES)[number] {
  return Boolean(value && (CASE_TYPES as readonly string[]).includes(value));
}

function buildApplicableCaseTypesFilter(caseType: (typeof CASE_TYPES)[number]): string {
  return `applicable_case_types.cs.${JSON.stringify([caseType])},applicable_case_types.is.null`;
}

async function fetchTemplateReferenceData(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ categories: TemplateCategoryRow[]; locationAreas: LocationAreaRow[] }> {
  const [categoriesRes, locationAreas] = await Promise.all([
    supabase.from("template_categories").select("*").order("sort_order", { ascending: true }),
    fetchLocationAreas(supabase),
  ]);

  if (categoriesRes.error) {
    throw new Error("template categories fetch failed");
  }

  return {
    categories: (categoriesRes.data ?? []) as TemplateCategoryRow[],
    locationAreas,
  };
}

export async function getTemplateReferenceData(): Promise<
  ActionResult<{ categories: TemplateCategoryRow[]; locationAreas: LocationAreaRow[] }>
> {
  await requireUser();
  const supabase = await createClient();

  try {
    return ok(await fetchTemplateReferenceData(supabase));
  } catch {
    return fail("テンプレート設定用マスタの取得に失敗しました。");
  }
}

// ---- 一覧 ----

export type ListTemplatesParams = {
  categoryId?: number;
  caseType?: string;
  activeOnly?: boolean;
  areaId?: number;
  prefectureId?: number;
  municipalityId?: number;
  q?: string;
  sort?: string;
  order?: string;
};

export async function listTemplates(params: ListTemplatesParams = {}): Promise<
  ActionResult<{
    categories: TemplateCategoryRow[];
    locationAreas: LocationAreaRow[];
    templates: TemplateListRow[];
  }>
> {
  await requireUser();
  const supabase = await createClient();

  // 並べ替え許可カラムの whitelist。未指定・不正値は既定順（name 昇順）を維持する。
  const sortableColumns = ["name", "file_type", "version", "is_active", "updated_at", "created_at"];
  const sortColumn = params.sort && sortableColumns.includes(params.sort) ? params.sort : "name";
  const ascending = params.order !== "desc";

  try {
    const [{ categories, locationAreas }, tmplRes] = await Promise.all([
      fetchTemplateReferenceData(supabase),
      (async () => {
        let q = supabase
          .from("templates")
          .select(
            "id, name, category_id, municipality_id, file_type, version, is_active, applicable_case_types, created_at, updated_at, template_categories!inner(name), template_mappings(count)",
          );
        if (params.activeOnly !== false) q = q.eq("is_active", true);
        if (params.categoryId) q = q.eq("category_id", params.categoryId);
        if (params.municipalityId) q = q.eq("municipality_id", params.municipalityId);
        if (isKnownCaseType(params.caseType)) {
          q = q.or(buildApplicableCaseTypesFilter(params.caseType));
        }
        const keyword = params.q?.trim();
        if (keyword) {
          q = q.ilike("name", `%${keyword}%`);
        }
        return q.order(sortColumn, { ascending });
      })(),
    ]);

    if (tmplRes.error) return fail("テンプレート一覧の取得に失敗しました。");

    const locationLookup = buildLocationLookup(locationAreas);
    let templates = (tmplRes.data ?? []).map((t) => {
      const cat = t.template_categories as unknown as { name?: string | null } | null;
      const row = t as {
        id: number;
        name: string;
        category_id: number;
        municipality_id: number | null;
        file_type: string;
        version: number;
        is_active: boolean;
        applicable_case_types: string[] | null;
        created_at: string;
        updated_at: string;
        template_mappings?: unknown;
      };
      const location = row.municipality_id
        ? (locationLookup.get(row.municipality_id) ?? null)
        : null;

      return {
        id: row.id,
        name: row.name,
        category_id: row.category_id,
        municipality_id: row.municipality_id,
        file_type: row.file_type,
        version: row.version,
        is_active: row.is_active,
        applicable_case_types: row.applicable_case_types ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        category_name: cat?.name ?? "",
        location_label: formatLocationLabel(location),
        mapping_count: extractMappingCount(row.template_mappings),
      };
    });

    if (params.prefectureId) {
      templates = templates.filter((template) => {
        const location = template.municipality_id
          ? (locationLookup.get(template.municipality_id) ?? null)
          : null;
        return location?.prefecture_id === params.prefectureId;
      });
    }

    if (params.areaId) {
      templates = templates.filter((template) => {
        const location = template.municipality_id
          ? (locationLookup.get(template.municipality_id) ?? null)
          : null;
        return location?.area_id === params.areaId;
      });
    }

    return ok({
      categories,
      locationAreas,
      templates,
    });
  } catch {
    return fail("地域マスタの取得に失敗しました。");
  }
}

export async function listTemplateGenerationOptions(
  caseType?: string,
): Promise<ActionResult<TemplateGenerationOption[]>> {
  await requireUser();
  const supabase = await createClient();

  try {
    const [locationAreas, tmplRes] = await Promise.all([
      fetchLocationAreas(supabase),
      (async () => {
        let q = supabase
          .from("templates")
          .select(
            "id, name, file_type, version, description, municipality_id, template_categories!inner(name), template_mappings(count)",
          );
        q = q.eq("is_active", true);
        if (isKnownCaseType(caseType)) {
          q = q.or(buildApplicableCaseTypesFilter(caseType));
        }
        return q.order("name", { ascending: true });
      })(),
    ]);

    if (tmplRes.error) return fail("帳票生成用テンプレートの取得に失敗しました。");

    const locationLookup = buildLocationLookup(locationAreas);
    const templates = (tmplRes.data ?? [])
      .map((template) => {
        const row = template as {
          id: number;
          name: string;
          file_type: string;
          version: number;
          description: string | null;
          municipality_id: number | null;
          template_categories?: { name?: string | null } | null;
          template_mappings?: unknown;
        };
        const location = row.municipality_id
          ? (locationLookup.get(row.municipality_id) ?? null)
          : null;
        const mappingCount = extractMappingCount(row.template_mappings);

        return {
          id: row.id,
          name: row.name,
          file_type: row.file_type,
          version: row.version,
          category_name: row.template_categories?.name ?? "",
          location_label: formatLocationLabel(location),
          description: row.description,
          mapping_count: mappingCount,
        };
      })
      .filter(
        (template) =>
          !isDebugTemplateDescription(template.description) &&
          (template.file_type !== "xlsx" || template.mapping_count > 0),
      )
      .map(({ description: _description, ...template }) => template);

    return ok(templates);
  } catch {
    return fail("地域マスタの取得に失敗しました。");
  }
}

// ---- 詳細 ----

export async function getTemplate(id: number): Promise<ActionResult<TemplateDetail>> {
  await requireUser();
  const supabase = await createClient();

  let locationAreas: LocationAreaRow[];
  try {
    locationAreas = await fetchLocationAreas(supabase);
  } catch {
    return fail("地域マスタの取得に失敗しました。");
  }

  const { data, error } = await supabase
    .from("templates")
    .select("*, template_categories(*), template_mappings(*)")
    .eq("id", id)
    .single();
  if (error || !data) return fail("テンプレートが見つかりませんでした。");

  const locationLookup = buildLocationLookup(locationAreas);
  const row = data as unknown as TemplateRow;
  const location = row.municipality_id ? (locationLookup.get(row.municipality_id) ?? null) : null;

  return ok({
    ...row,
    applicable_case_types: (data.applicable_case_types ?? null) as string[] | null,
    category: data.template_categories as unknown as TemplateCategoryRow,
    mappings: (data.template_mappings as TemplateMappingRow[]).sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    ),
    location,
  });
}

async function buildTemplatePreviewFromStorage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  template: Pick<TemplateRow, "file_path" | "file_type">,
): Promise<ActionResult<TemplatePreview>> {
  const storagePath = template.file_path.replace(/^templates\//, "");
  const { data: blob, error: downloadError } = await supabase.storage
    .from("templates")
    .download(storagePath);
  if (downloadError || !blob) return fail("テンプレートファイルの取得に失敗しました。");

  try {
    const buffer = await blob.arrayBuffer();
    if (template.file_type === "xlsx") return ok(await buildXlsxPreview(buffer));
    if (template.file_type === "docx") return ok(buildDocxPreview(buffer));
    return fail("このファイル形式はプレビューに対応していません。");
  } catch {
    return fail("テンプレートプレビューの作成に失敗しました。");
  }
}

export async function getTemplatePreview(id: number): Promise<ActionResult<TemplatePreview>> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: template, error } = await supabase
    .from("templates")
    .select("id, file_path, file_type")
    .eq("id", id)
    .single();
  if (error || !template) return fail("テンプレートが見つかりませんでした。");

  return buildTemplatePreviewFromStorage(supabase, template);
}

function openAiMappingErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return "AIの応答JSONを読み取れませんでした。もう一度お試しください。";
  }

  const status = typeof error === "object" && error ? (error as { status?: unknown }).status : null;
  if (status === 401) {
    return "OpenAI APIキーを確認できませんでした。管理者に設定を確認してもらってください。";
  }
  if (status === 429) {
    return "AIの利用上限に達している可能性があります。時間をおいてもう一度お試しください。";
  }

  const message = error instanceof Error ? error.message : "";
  if (/json|schema|parse|structured/i.test(message)) {
    return "AIの応答JSONを読み取れませんでした。もう一度お試しください。";
  }

  return "AI候補の作成に失敗しました。時間をおいてもう一度お試しください。";
}

export async function suggestTemplateMappings(
  templateId: number,
): Promise<ActionResult<TemplateMappingSuggestion>> {
  await requireAdmin();

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return fail("OpenAI APIキーが未設定です。管理者に OPENAI_API_KEY の設定を依頼してください。");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates")
    .select(
      "id, name, file_path, file_type, description, template_categories(name), template_mappings(*)",
    )
    .eq("id", templateId)
    .single();
  if (error || !data) return fail("テンプレートが見つかりませんでした。");

  const template = data as unknown as TemplateRow & {
    template_categories?: { name?: string | null } | null;
    template_mappings?: TemplateMappingRow[] | null;
  };
  if (template.file_type !== "xlsx" && template.file_type !== "docx") {
    return fail("このファイル形式はAI候補作成に対応していません。");
  }

  const previewResult = await buildTemplatePreviewFromStorage(supabase, template);
  if (!previewResult.ok) return fail(previewResult.error);

  const payload = buildAiMappingPayload({
    template: {
      id: template.id,
      name: template.name,
      fileType: template.file_type,
      description: template.description,
      categoryName: template.template_categories?.name ?? null,
    },
    preview: previewResult.data,
    existingMappings: template.template_mappings ?? [],
  });
  const model = process.env.OPENAI_AI_MAPPING_MODEL?.trim() || AI_MAPPING_MODEL_DEFAULT;

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.parse({
      model,
      input: [
        {
          role: "system",
          content: TEMPLATE_MAPPING_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content:
            "以下はテンプレートファイル本体ではなく、既存のプレビュー情報・既存マッピング・フィールド辞書だけをまとめたJSONです。\n" +
            JSON.stringify(payload),
        },
      ],
      text: {
        format: zodTextFormat(AiMappingSuggestionSchema, "template_mapping_suggestions"),
      },
    });

    const parsed = AiMappingSuggestionSchema.safeParse(response.output_parsed);
    if (!parsed.success) {
      return fail("AIの応答JSONを読み取れませんでした。もう一度お試しください。");
    }

    return ok(normalizeAiMappingSuggestion(parsed.data, previewResult.data));
  } catch (err) {
    return fail(openAiMappingErrorMessage(err));
  }
}

// ---- アップロード ----

export async function uploadTemplate(formData: FormData): Promise<ActionResult<{ id: number }>> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return fail("ファイルを選択してください。");
  if (file.size > 10 * 1024 * 1024) return fail("ファイルサイズは10MB以下にしてください。");

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "docx" && ext !== "xlsx") {
    return fail(
      "ファイル形式は .docx または .xlsx のみ対応しています。事前に変換してからアップロードしてください。",
    );
  }

  const meta = TemplateMetaSchema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    municipalityId: formData.get("municipalityId"),
    description: formData.get("description") || undefined,
    applicableCaseTypes: formData.getAll("applicableCaseTypes"),
  });
  if (!meta.success) {
    const first = meta.error.issues[0];
    return fail(first?.message ?? "入力内容を確認してください。");
  }

  const { data: catRow } = await supabase
    .from("template_categories")
    .select("slug")
    .eq("id", meta.data.categoryId)
    .single();
  if (!catRow) return fail("カテゴリが見つかりませんでした。");

  const applicableCaseTypes =
    meta.data.applicableCaseTypes && meta.data.applicableCaseTypes.length > 0
      ? meta.data.applicableCaseTypes
      : null;

  const { data: tmpl, error: insertErr } = await supabase
    .from("templates")
    .insert({
      name: meta.data.name,
      category_id: meta.data.categoryId,
      municipality_id: meta.data.municipalityId ?? null,
      file_path: "templates/_pending",
      file_type: ext,
      original_file_name: file.name,
      version: 1,
      is_active: true,
      description: meta.data.description ?? null,
      applicable_case_types: applicableCaseTypes as unknown as import("@/types/database").Json,
      uploaded_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (insertErr || !tmpl) return fail("テンプレートの登録に失敗しました。");

  const storagePath = `${catRow.slug}/${tmpl.id}_v1.${ext}`;
  const arrayBuf = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from("templates")
    .upload(storagePath, Buffer.from(arrayBuf), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadErr) {
    await supabase.from("templates").delete().eq("id", tmpl.id);
    return fail("ファイルのアップロードに失敗しました。再度お試しください。");
  }

  const filePath = `templates/${storagePath}`;
  const { error: pathUpdateErr } = await supabase
    .from("templates")
    .update({ file_path: filePath })
    .eq("id", tmpl.id);
  if (pathUpdateErr) {
    await supabase.storage.from("templates").remove([storagePath]);
    await supabase.from("templates").delete().eq("id", tmpl.id);
    return fail("テンプレートファイル情報の更新に失敗しました。");
  }

  // DOCX のプレースホルダー自動検出 → マッピング初期化
  if (ext === "docx") {
    const placeholders = detectPlaceholdersInDocx(arrayBuf);
    if (placeholders.length > 0) {
      const { error: mappingErr } = await supabase
        .from("template_mappings")
        .insert(buildDetectedMappings(tmpl.id, placeholders));
      if (mappingErr) {
        await supabase.storage.from("templates").remove([storagePath]);
        await supabase.from("templates").delete().eq("id", tmpl.id);
        return fail("テンプレートのマッピング初期化に失敗しました。");
      }
    }
  }

  await logAudit({
    userId: user.id,
    action: "template.upload",
    entityType: "template",
    entityId: tmpl.id,
    detail: {
      name: meta.data.name,
      categoryId: meta.data.categoryId,
      municipalityId: meta.data.municipalityId ?? null,
      ext,
    },
  });

  revalidatePath("/templates");
  return ok({ id: tmpl.id });
}

// ---- 新バージョンとしてアップロード ----

export async function uploadTemplateNewVersion(
  templateId: number,
  formData: FormData,
): Promise<ActionResult<{ id: number }>> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { data: oldTmpl, error: fetchErr } = await supabase
    .from("templates")
    .select("*, template_categories(slug), template_mappings(*)")
    .eq("id", templateId)
    .single();
  if (fetchErr || !oldTmpl) return fail("テンプレートが見つかりませんでした。");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return fail("ファイルを選択してください。");
  if (file.size > 10 * 1024 * 1024) return fail("ファイルサイズは10MB以下にしてください。");

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "docx" && ext !== "xlsx") {
    return fail(
      "ファイル形式は .docx または .xlsx のみ対応しています。事前に変換してからアップロードしてください。",
    );
  }

  const catSlug = (oldTmpl.template_categories as { slug: string } | null)?.slug ?? "other";
  const nextVersion = (oldTmpl.version ?? 1) + 1;

  const { data: newTmpl, error: insertErr } = await supabase
    .from("templates")
    .insert({
      name: oldTmpl.name,
      category_id: oldTmpl.category_id,
      municipality_id: oldTmpl.municipality_id,
      file_path: "templates/_pending",
      file_type: ext,
      original_file_name: file.name,
      version: nextVersion,
      is_active: true,
      description: oldTmpl.description,
      applicable_case_types: oldTmpl.applicable_case_types,
      uploaded_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (insertErr || !newTmpl) return fail("テンプレートの登録に失敗しました。");

  const storagePath = `${catSlug}/${newTmpl.id}_v${nextVersion}.${ext}`;
  const arrayBuf = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from("templates")
    .upload(storagePath, Buffer.from(arrayBuf), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadErr) {
    await supabase.from("templates").delete().eq("id", newTmpl.id);
    return fail("ファイルのアップロードに失敗しました。再度お試しください。");
  }

  const { error: pathUpdateErr } = await supabase
    .from("templates")
    .update({ file_path: `templates/${storagePath}` })
    .eq("id", newTmpl.id);
  if (pathUpdateErr) {
    await supabase.storage.from("templates").remove([storagePath]);
    await supabase.from("templates").delete().eq("id", newTmpl.id);
    return fail("テンプレートファイル情報の更新に失敗しました。");
  }

  const { error: deactivateErr } = await supabase
    .from("templates")
    .update({ is_active: false })
    .eq("id", templateId);
  if (deactivateErr) {
    await supabase.storage.from("templates").remove([storagePath]);
    await supabase.from("templates").delete().eq("id", newTmpl.id);
    return fail("旧バージョンの無効化に失敗しました。");
  }

  const oldMappings = (oldTmpl.template_mappings ?? []) as TemplateMappingRow[];
  if (ext === "docx") {
    const placeholders = detectPlaceholdersInDocx(arrayBuf);
    if (placeholders.length > 0) {
      const { error: mappingErr } = await supabase
        .from("template_mappings")
        .insert(buildDetectedMappings(newTmpl.id, placeholders, oldMappings));
      if (mappingErr) {
        await supabase.from("templates").update({ is_active: true }).eq("id", templateId);
        await supabase.storage.from("templates").remove([storagePath]);
        await supabase.from("templates").delete().eq("id", newTmpl.id);
        return fail("テンプレートのマッピング初期化に失敗しました。");
      }
    }
  } else if (oldMappings.length > 0) {
    const { error: mappingErr } = await supabase.from("template_mappings").insert(
      oldMappings.map((m, index) => ({
        template_id: newTmpl.id,
        ...normalizeMappingRow(m),
        sort_order: index,
      })),
    );
    if (mappingErr) {
      await supabase.from("templates").update({ is_active: true }).eq("id", templateId);
      await supabase.storage.from("templates").remove([storagePath]);
      await supabase.from("templates").delete().eq("id", newTmpl.id);
      return fail("テンプレートのマッピング引き継ぎに失敗しました。");
    }
  }

  await logAudit({
    userId: user.id,
    action: "template.upload",
    entityType: "template",
    entityId: newTmpl.id,
    detail: {
      name: oldTmpl.name,
      previousTemplateId: templateId,
      version: nextVersion,
    },
  });

  revalidatePath("/templates");
  return ok({ id: newTmpl.id });
}

// ---- メタ情報更新 ----

export async function updateTemplateMeta(
  id: number,
  input: {
    name?: string;
    description?: string | null;
    applicableCaseTypes?: string[] | null;
    categoryId?: number;
    municipalityId?: number | null;
  },
): Promise<ActionResult<{ id: number }>> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { data: before } = await supabase.from("templates").select("*").eq("id", id).single();
  if (!before) return fail("テンプレートが見つかりませんでした。");

  const { error } = await supabase
    .from("templates")
    .update({
      ...(input.name != null ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.applicableCaseTypes !== undefined
        ? {
            applicable_case_types:
              input.applicableCaseTypes as unknown as import("@/types/database").Json,
          }
        : {}),
      ...(input.categoryId != null ? { category_id: input.categoryId } : {}),
      ...(input.municipalityId !== undefined ? { municipality_id: input.municipalityId } : {}),
    })
    .eq("id", id);

  if (error) return fail("更新に失敗しました。");

  await logAudit({
    userId: user.id,
    action: "template.update",
    entityType: "template",
    entityId: id,
    detail: { before, after: input },
  });

  revalidatePath("/templates");
  revalidatePath(`/templates/${id}`);
  return ok({ id });
}

// ---- 無効化 ----

export async function deactivateTemplate(id: number): Promise<ActionResult<{ id: number }>> {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase.from("templates").select("id, name").eq("id", id).single();
  if (!data) return fail("テンプレートが見つかりませんでした。");

  const { error } = await supabase.from("templates").update({ is_active: false }).eq("id", id);
  if (error) return fail("無効化に失敗しました。");

  await logAudit({
    userId: user.id,
    action: "template.deactivate",
    entityType: "template",
    entityId: id,
    detail: { name: data.name },
  });

  revalidatePath("/templates");
  return ok({ id });
}

// ---- マッピング一括更新 ----

export async function upsertMappings(
  templateId: number,
  mappings: Array<{
    placeholder: string;
    fieldPath: string;
    label?: string;
    isRequired?: boolean;
    sortOrder?: number;
  }>,
): Promise<ActionResult<{ count: number }>> {
  await requireAdmin();
  const supabase = await createClient();

  const parsed = z.array(MappingRowSchema).safeParse(mappings);
  if (!parsed.success) {
    return fail("マッピング内容を確認してください。");
  }

  const { data: tmpl } = await supabase
    .from("templates")
    .select("id")
    .eq("id", templateId)
    .single();
  if (!tmpl) return fail("テンプレートが見つかりませんでした。");

  const rows = parsed.data.map((m, i) => {
    const canonicalPath = canonicalizeFieldPath(m.fieldPath);
    const suggested = suggestFieldEntry(m.fieldPath || m.placeholder);
    return {
      placeholder: m.placeholder,
      field_path: canonicalPath,
      label: m.label || suggested?.label || fieldLabel(canonicalPath),
      is_required: m.isRequired,
      sort_order: m.sortOrder ?? i,
    };
  });

  const { error } = await supabase.rpc("replace_template_mappings", {
    p_template_id: templateId,
    p_rows: rows as unknown as import("@/types/database").Json,
  });
  if (error) return fail("マッピングの保存に失敗しました。");

  revalidatePath(`/templates/${templateId}`);
  return ok({ count: parsed.data.length });
}

// ---- 転記前チェック ----

export async function previewTemplateFill(
  templateId: number,
  caseId: number,
): Promise<
  ActionResult<{
    totalFields: number;
    filledFields: number;
    missingRequired: string[];
    missingOptional: string[];
    previewData: Record<string, string>;
  }>
> {
  await requireUser();
  const supabase = await createClient();

  const [tmplRes, caseRes, personsRes, parcelsRes, financialRes] = await Promise.all([
    supabase.from("templates").select("*, template_mappings(*)").eq("id", templateId).single(),
    supabase.from("cases").select("*").eq("id", caseId).single(),
    supabase.from("case_persons").select("*").eq("case_id", caseId).order("sort_order"),
    supabase.from("case_parcels").select("*").eq("case_id", caseId).order("sort_order"),
    supabase.from("case_financials").select("*").eq("case_id", caseId).maybeSingle(),
  ]);

  if (tmplRes.error || !tmplRes.data) return fail("テンプレートが見つかりませんでした。");
  if (caseRes.error || !caseRes.data) return fail("案件が見つかりませんでした。");
  if (isDebugTemplateDescription(tmplRes.data.description)) {
    return fail(
      "動作確認用テンプレートは帳票生成に使えません。通常版テンプレートへ差し替えてください。",
    );
  }

  const rawMappings = (tmplRes.data.template_mappings ?? []) as TemplateMappingRow[];
  const mappings: Mapping[] = rawMappings.map((m) => ({
    placeholder: m.placeholder,
    fieldPath: canonicalizeFieldPath(m.field_path),
    label: m.label ?? undefined,
    isRequired: m.is_required ?? false,
  }));
  if (tmplRes.data.file_type === "xlsx" && mappings.length === 0) {
    return fail(
      "Excel テンプレートに転記マッピングが未設定です。テンプレート設定画面でセル座標を登録してください。",
    );
  }

  const ctx = buildTransferContext({
    caseRow: caseRes.data as Parameters<typeof buildTransferContext>[0]["caseRow"],
    casePersons: (personsRes.data ?? []) as Parameters<
      typeof buildTransferContext
    >[0]["casePersons"],
    parcels: (parcelsRes.data ?? []) as Parameters<typeof buildTransferContext>[0]["parcels"],
    financial: financialRes.data as Parameters<typeof buildTransferContext>[0]["financial"],
  });

  const result = preCheck(ctx, mappings);
  return ok(result);
}
