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
import type { TransferContext } from "@/types/transfer";

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

const context: TransferContext = {
  caseNumber: "VERIFY-CASE-001",
  caseName: "転記検証案件",
  caseMemo: "資材置場・駐車場",
  caseTypeLabel: "農地転用許可",
  submissionTarget: "豊橋市農業委員会",
  submissionDate: "令和8年5月20日",
  deadlineDate: "令和8年6月30日",
  today: "令和8年5月20日",
  todayYear: "令和8年",
  todayMonth: "5",
  todayDay: "20",
  applicant: {
    name: "検証申請者",
    nameKana: "ケンショウシンセイシャ",
    zip: "440-8501",
    addressPref: "愛知県",
    addressCity: "豊橋市",
    addressTown: "今橋町",
    addressLine1: "1番地",
    addressLine2: "検証ビル101",
    addressFull: "愛知県豊橋市今橋町1番地検証ビル101",
    addressNoPref: "豊橋市今橋町1番地検証ビル101",
    phone: "0532-00-0001",
    fax: "0532-00-0002",
    email: "applicant@example.test",
    corporateNumber: "1234567890123",
    representativeName: "検証代表者",
  },
  transferee: {
    name: "検証譲受人",
    nameKana: "ケンショウユズリウケニン",
    zip: "440-0888",
    addressPref: "愛知県",
    addressCity: "豊橋市",
    addressTown: "駅前大通",
    addressLine1: "2-1",
    addressLine2: "",
    addressFull: "愛知県豊橋市駅前大通2-1",
    addressNoPref: "豊橋市駅前大通2-1",
    phone: "0532-00-1001",
    fax: "",
    email: "transferee@example.test",
    corporateNumber: "",
    representativeName: "",
  },
  transferor: {
    name: "検証譲渡人",
    nameKana: "ケンショウユズリワタシニン",
    zip: "441-0000",
    addressPref: "愛知県",
    addressCity: "豊橋市",
    addressTown: "大岩町",
    addressLine1: "3-2",
    addressLine2: "",
    addressFull: "愛知県豊橋市大岩町3-2",
    addressNoPref: "豊橋市大岩町3-2",
    phone: "0532-00-2001",
    fax: "",
    email: "transferor@example.test",
    corporateNumber: "",
    representativeName: "",
  },
  agent: {
    name: "検証代理人",
    nameKana: "ケンショウダイリニン",
    zip: "440-0011",
    addressPref: "愛知県",
    addressCity: "豊橋市",
    addressTown: "牛川町",
    addressLine1: "4-3",
    addressLine2: "",
    addressFull: "愛知県豊橋市牛川町4-3",
    addressNoPref: "豊橋市牛川町4-3",
    phone: "0532-00-3001",
    fax: "",
    email: "agent@example.test",
    corporateNumber: "",
    representativeName: "",
  },
  billing: {
    name: "検証請求先",
    nameKana: "ケンショウセイキュウサキ",
    zip: "440-0022",
    addressPref: "愛知県",
    addressCity: "豊橋市",
    addressTown: "向山町",
    addressLine1: "5-4",
    addressLine2: "",
    addressFull: "愛知県豊橋市向山町5-4",
    addressNoPref: "豊橋市向山町5-4",
    phone: "0532-00-4001",
    fax: "",
    email: "billing@example.test",
    corporateNumber: "",
    representativeName: "",
  },
  neighbor: {
    name: "検証隣地所有者",
    nameKana: "ケンショウリンチショユウシャ",
    zip: "440-0033",
    addressPref: "愛知県",
    addressCity: "豊橋市",
    addressTown: "東田町",
    addressLine1: "6-5",
    addressLine2: "",
    addressFull: "愛知県豊橋市東田町6-5",
    addressNoPref: "豊橋市東田町6-5",
    phone: "0532-00-5001",
    fax: "",
    email: "neighbor@example.test",
    corporateNumber: "",
    representativeName: "",
  },
  applicants: [
    {
      name: "検証申請者1",
      nameKana: "ケンショウシンセイシャイチ",
      zip: "440-8501",
      addressPref: "愛知県",
      addressCity: "豊橋市",
      addressTown: "今橋町",
      addressLine1: "1番地",
      addressLine2: "",
      addressFull: "愛知県豊橋市今橋町1番地",
      addressNoPref: "豊橋市今橋町1番地",
      phone: "0532-00-0001",
      fax: "",
      email: "applicant1@example.test",
      corporateNumber: "",
      representativeName: "",
    },
    {
      name: "検証申請者2",
      nameKana: "ケンショウシンセイシャニ",
      zip: "440-8502",
      addressPref: "愛知県",
      addressCity: "豊橋市",
      addressTown: "八町通",
      addressLine1: "2番地",
      addressLine2: "",
      addressFull: "愛知県豊橋市八町通2番地",
      addressNoPref: "豊橋市八町通2番地",
      phone: "0532-00-0002",
      fax: "",
      email: "applicant2@example.test",
      corporateNumber: "",
      representativeName: "",
    },
  ],
  neighbors: [
    {
      name: "検証隣地所有者1",
      nameKana: "ケンショウリンチイチ",
      zip: "440-0033",
      addressPref: "愛知県",
      addressCity: "豊橋市",
      addressTown: "東田町",
      addressLine1: "6-5",
      addressLine2: "",
      addressFull: "愛知県豊橋市東田町6-5",
      addressNoPref: "豊橋市東田町6-5",
      phone: "0532-00-5001",
      fax: "",
      email: "neighbor1@example.test",
      corporateNumber: "",
      representativeName: "",
    },
    {
      name: "検証隣地所有者2",
      nameKana: "ケンショウリンチニ",
      zip: "440-0034",
      addressPref: "愛知県",
      addressCity: "豊橋市",
      addressTown: "東田町",
      addressLine1: "7-6",
      addressLine2: "",
      addressFull: "愛知県豊橋市東田町7-6",
      addressNoPref: "豊橋市東田町7-6",
      phone: "0532-00-5002",
      fax: "",
      email: "neighbor2@example.test",
      corporateNumber: "",
      representativeName: "",
    },
  ],
  parcels: [
    {
      pref: "愛知県",
      city: "豊橋市",
      oaza: "",
      aza: "大岩町字検証",
      oazaAza: "大岩町字検証",
      chiban: "100-1",
      locationFull: "豊橋市大岩町字検証100-1",
      chimoku: "畑",
      area: "123.45",
      tenyoArea: "120.00",
    },
    {
      pref: "愛知県",
      city: "豊橋市",
      oaza: "",
      aza: "大岩町字検証",
      oazaAza: "大岩町字検証",
      chiban: "100-2",
      locationFull: "豊橋市大岩町字検証100-2",
      chimoku: "田",
      area: "234.56",
      tenyoArea: "230.00",
    },
  ],
  parcel: {
    pref: "愛知県",
    city: "豊橋市",
    oaza: "",
    aza: "大岩町字検証",
    oazaAza: "大岩町字検証",
    chiban: "100-1",
    locationFull: "豊橋市大岩町字検証100-1",
    chimoku: "畑",
    area: "123.45",
    tenyoArea: "120.00",
  },
  totalArea: "358.01",
  totalTenyoArea: "350.00",
  estimateAmount: "100,000",
  estimateAmountTax: "10,000",
  estimateAmountTotal: "110,000",
  invoiceAmount: "120,000",
  invoiceAmountTax: "12,000",
  invoiceAmountTotal: "132,000",
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
          value: resolvePath(context, mapping.fieldPath),
        }))
        .filter((entry) => entry.value);
      if (expectedValues.length === 0) continue;

      const buffer = await downloadTemplate(template);
      const output = fillDocx(buffer, context, false, mappings);
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
          value: resolvePath(context, mapping.fieldPath),
        }))
        .filter((entry) => entry.value);
      if (expectedValues.length === 0) continue;

      const buffer = await downloadTemplate(template);
      const output = await fillXlsx(buffer, context, mappings, false);
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
  }, 30_000);
});
