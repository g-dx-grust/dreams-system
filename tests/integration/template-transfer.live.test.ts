import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { fillDocx } from "@/lib/transfer/docx";
import { fillXlsx } from "@/lib/transfer/xlsx";
import { resolvePath, type Mapping } from "@/lib/transfer/engine";
import { canonicalizeFieldPath } from "@/lib/transfer/field-dict";
import { SAMPLE_TRANSFER_CONTEXT } from "../fixtures/transfer-context";

const LIVE = process.env.LIVE_TEMPLATE_TRANSFER === "1";
const TEMPLATE_DEBUG_MARKER = "[toyohashi-mapping-check]";
const OUTPUT_DIR = path.join(process.cwd(), "tmp", "template-transfer-live");
let cachedSupabase: ReturnType<typeof createClient> | null = null;

type TemplateMappingRecord = {
  placeholder: string;
  field_path: string;
  label: string | null;
  is_required: boolean | null;
  sort_order: number | null;
};

type TemplateRecord = {
  id: number;
  name: string;
  file_type: "docx" | "xlsx";
  file_path: string;
  description: string | null;
  template_mappings: TemplateMappingRecord[] | null;
};

async function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env.local");
  let raw = "";

  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (!key || process.env[key]) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function supabaseClient() {
  if (cachedSupabase) return cachedSupabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(".env.local に Supabase URL と service role key が必要です。");
  }

  cachedSupabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedSupabase;
}

async function fetchLiveTemplates(): Promise<TemplateRecord[]> {
  await loadEnvFile();
  const supabase = supabaseClient();
  const { data, error } = await supabase
    .from("templates")
    .select("id, name, file_type, file_path, description, template_mappings(*)")
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as TemplateRecord[]).filter(
    (template) => !String(template.description ?? "").includes(TEMPLATE_DEBUG_MARKER),
  );
}

async function downloadTemplate(template: TemplateRecord): Promise<ArrayBuffer> {
  const supabase = supabaseClient();
  const storagePath = template.file_path.replace(/^templates\//u, "");
  const { data, error } = await supabase.storage.from("templates").download(storagePath);
  if (error || !data) throw new Error(`${template.name}: テンプレートを取得できません。`);
  return data.arrayBuffer();
}

function buildMappings(template: TemplateRecord): Mapping[] {
  return [...(template.template_mappings ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((mapping) => ({
      placeholder: mapping.placeholder,
      fieldPath: canonicalizeFieldPath(mapping.field_path),
      label: mapping.label ?? undefined,
      isRequired: mapping.is_required ?? false,
    }));
}

function extractDocxText(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  const texts: string[] = [];

  for (const fileName of Object.keys(zip.files)) {
    if (!/^word\/(?:document|header\d+|footer\d+)\.xml$/u.test(fileName)) continue;
    const xml = zip.file(fileName)?.asText() ?? "";
    texts.push(
      xml
        .replace(/<w:tab\b[^>]*\/>/gu, "\t")
        .replace(/<w:br\b[^>]*\/>/gu, "\n")
        .replace(/<[^>]+>/gu, "")
        .replace(/\s+/gu, " "),
    );
  }

  return texts.join(" ").trim();
}

function normalizeSheetName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/gu, "'");
  }
  return trimmed;
}

function parseXlsxPlaceholder(
  raw: string,
  workbook: ExcelJS.Workbook,
): { sheetName?: string; cellRef: string } {
  const direct = raw.match(/^([^!]+)!(.+)$/u);
  if (direct?.[1] && direct[2]) {
    return { sheetName: normalizeSheetName(direct[1]), cellRef: direct[2] };
  }

  const ranges = workbook.definedNames.getRanges(raw);
  if (ranges && ranges.ranges.length > 0) {
    const range = ranges.ranges[0];
    const named = range?.match(/^([^!]+)!(\$?[A-Z]+\$?\d+)$/u);
    if (named?.[1] && named[2]) {
      return {
        sheetName: normalizeSheetName(named[1]),
        cellRef: named[2].replace(/\$/gu, ""),
      };
    }
  }

  return { cellRef: raw };
}

function formatCellValue(value: ExcelJS.CellValue): string {
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

function outputPathFor(template: TemplateRecord) {
  const safeName = template.name.replace(/[^\p{L}\p{N}._-]+/gu, "_");
  return path.join(OUTPUT_DIR, `${template.id}_${safeName}.${template.file_type}`);
}

function valueMatches(renderedValue: ExcelJS.CellValue, expected: string): boolean {
  const renderedText = formatCellValue(renderedValue);
  if (renderedText === expected || renderedText.includes(expected)) return true;

  const expectedNumber = Number(expected.replace(/,/gu, ""));
  if (!Number.isFinite(expectedNumber)) return false;
  return Number(renderedValue) === expectedNumber;
}

describe.skipIf(!LIVE)("live template transfer", () => {
  it("Supabase上の有効なWordテンプレートへDBマッピングで転記できる", async () => {
    const templates = (await fetchLiveTemplates()).filter(
      (template) => template.file_type === "docx" && (template.template_mappings?.length ?? 0) > 0,
    );
    const checked: Array<{ id: number; name: string; mappings: number }> = [];
    const failures: string[] = [];

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    for (const template of templates) {
      const mappings = buildMappings(template);
      const expectedValues = mappings
        .map((mapping) => ({
          mapping,
          value: resolvePath(SAMPLE_TRANSFER_CONTEXT, mapping.fieldPath),
        }))
        .filter((entry) => entry.value);
      if (expectedValues.length === 0) continue;

      const buffer = await downloadTemplate(template);
      const output = fillDocx(buffer, SAMPLE_TRANSFER_CONTEXT, false, mappings);
      await fs.writeFile(outputPathFor(template), output);
      const text = extractDocxText(output);

      for (const { mapping, value } of expectedValues) {
        if (!text.includes(value)) {
          failures.push(`${template.id} ${template.name}: ${mapping.placeholder} -> ${value}`);
        }
      }

      checked.push({ id: template.id, name: template.name, mappings: expectedValues.length });
    }

    expect(checked.length, "検証可能なWordテンプレートがありません。").toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 120_000);

  it("Supabase上の有効なExcelテンプレートへマッピング座標どおり転記できる", async () => {
    const templates = (await fetchLiveTemplates()).filter(
      (template) => template.file_type === "xlsx" && (template.template_mappings?.length ?? 0) > 0,
    );
    const checked: Array<{ id: number; name: string; mappings: number }> = [];
    const failures: string[] = [];

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    for (const template of templates) {
      const mappings = buildMappings(template);
      const expectedValues = mappings
        .map((mapping) => ({
          mapping,
          value: resolvePath(SAMPLE_TRANSFER_CONTEXT, mapping.fieldPath),
        }))
        .filter((entry) => entry.value);
      if (expectedValues.length === 0) continue;

      const buffer = await downloadTemplate(template);
      const output = await fillXlsx(buffer, SAMPLE_TRANSFER_CONTEXT, mappings, false);
      await fs.writeFile(outputPathFor(template), output);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        output as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0],
      );

      for (const { mapping, value } of expectedValues) {
        const { sheetName, cellRef } = parseXlsxPlaceholder(mapping.placeholder, workbook);
        const sheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
        if (!sheet) {
          failures.push(`${template.id} ${template.name}: シートなし ${mapping.placeholder}`);
          continue;
        }

        const cell = sheet.getCell(cellRef);
        if (!valueMatches(cell.value, value)) {
          failures.push(
            `${template.id} ${template.name}: ${mapping.placeholder} expected=${value} actual=${formatCellValue(
              cell.value,
            )}`,
          );
        }
      }

      checked.push({ id: template.id, name: template.name, mappings: expectedValues.length });
    }

    expect(checked.length, "検証可能なExcelテンプレートがありません。").toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 120_000);
});
