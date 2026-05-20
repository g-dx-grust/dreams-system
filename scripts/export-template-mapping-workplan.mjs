import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const PROJECT_ROOT = process.cwd();
const OUTPUT_DOCS_DIR = path.join(PROJECT_ROOT, "docs");
const OUTPUT_TMP_DIR = path.join(PROJECT_ROOT, "tmp", "template-mapping-workplan");
const DEBUG_MARKER = "[toyohashi-mapping-check]";

const CASE_TYPE_LABELS = {
  land_improvement: "土地改良区",
  boundary_survey: "境界確定測量",
  building_permit: "建築許可",
  farmland_conversion: "農地転用許可",
  other: "その他",
};

const INDEXED_PARCEL_COUNT = 13;

const PERSON_FIELD_DEFS = [
  ["name", "氏名"],
  ["nameKana", "フリガナ"],
  ["zip", "郵便番号"],
  ["addressPref", "都道府県"],
  ["addressCity", "市区町村"],
  ["addressTown", "町域"],
  ["addressLine1", "番地"],
  ["addressLine2", "建物名"],
  ["addressFull", "住所（全体）"],
  ["addressNoPref", "住所（都道府県除く）"],
  ["phone", "電話番号"],
  ["fax", "FAX"],
  ["email", "メール"],
  ["corporateNumber", "法人番号"],
  ["representativeName", "代表者氏名"],
];

const PARCEL_FIELD_DEFS = [
  ["pref", "所在都道府県"],
  ["city", "所在市区町村"],
  ["aza", "大字・字"],
  ["chiban", "地番"],
  ["locationFull", "所在地（市区町村〜地番）"],
  ["chimoku", "地目"],
  ["area", "地積"],
  ["tenyoArea", "転用面積"],
];

const FIELD_ENTRIES = buildFieldEntries();
const FIELD_LOOKUP = buildFieldLookup(FIELD_ENTRIES);

await main();

async function main() {
  await loadEnvFile();
  const supabase = supabaseClient();
  const [templates, locations] = await Promise.all([fetchTemplates(supabase), fetchLocations(supabase)]);
  const locationLookup = new Map(locations.map((location) => [location.id, location]));

  const templateRows = templates.map((template) => summarizeTemplate(template, locationLookup));
  const mappingRows = templates.flatMap((template) => buildMappingRows(template, locationLookup));
  const taskRows = buildTaskRows(templateRows);

  await fs.mkdir(OUTPUT_DOCS_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_TMP_DIR, { recursive: true });

  const generatedAt = new Date();
  const workbookPath = path.join(OUTPUT_DOCS_DIR, "template-mapping-workplan.xlsx");
  const markdownPath = path.join(OUTPUT_DOCS_DIR, "template-mapping-workplan.md");
  const templatesCsvPath = path.join(OUTPUT_TMP_DIR, "templates.csv");
  const mappingsCsvPath = path.join(OUTPUT_TMP_DIR, "mappings.csv");
  const tasksCsvPath = path.join(OUTPUT_TMP_DIR, "tasks.csv");
  const jsonPath = path.join(OUTPUT_TMP_DIR, "template-mapping-workplan.json");

  await Promise.all([
    writeWorkbook(workbookPath, templateRows, mappingRows, taskRows),
    fs.writeFile(markdownPath, buildMarkdown(templateRows, taskRows, generatedAt)),
    fs.writeFile(templatesCsvPath, toCsv(templateRows)),
    fs.writeFile(mappingsCsvPath, toCsv(mappingRows)),
    fs.writeFile(tasksCsvPath, toCsv(taskRows)),
    fs.writeFile(
      jsonPath,
      JSON.stringify(
        {
          generatedAt: generatedAt.toISOString(),
          summary: summarizeRows(templateRows),
          templates: templateRows,
          mappings: mappingRows,
          tasks: taskRows,
          fieldDictionary: FIELD_ENTRIES,
        },
        null,
        2,
      ),
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        generatedAt: generatedAt.toISOString(),
        summary: summarizeRows(templateRows),
        files: {
          workbook: path.relative(PROJECT_ROOT, workbookPath),
          markdown: path.relative(PROJECT_ROOT, markdownPath),
          templatesCsv: path.relative(PROJECT_ROOT, templatesCsvPath),
          mappingsCsv: path.relative(PROJECT_ROOT, mappingsCsvPath),
          tasksCsv: path.relative(PROJECT_ROOT, tasksCsvPath),
          json: path.relative(PROJECT_ROOT, jsonPath),
        },
      },
      null,
      2,
    ),
  );
}

async function loadEnvFile() {
  const envPath = path.join(PROJECT_ROOT, ".env.local");
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(".env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchTemplates(supabase) {
  const { data, error } = await supabase
    .from("templates")
    .select(
      "id, name, file_type, file_path, version, is_active, description, applicable_case_types, municipality_id, created_at, updated_at, template_categories(name, slug), template_mappings(id, placeholder, field_path, label, is_required, sort_order)",
    )
    .order("id", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function fetchLocations(supabase) {
  const { data: areas, error: areaError } = await supabase.from("location_areas").select("id, name");
  if (areaError) throw areaError;

  const { data: prefectures, error: prefError } = await supabase
    .from("location_prefectures")
    .select("id, name, area_id");
  if (prefError) throw prefError;

  const { data: municipalities, error: muniError } = await supabase
    .from("location_municipalities")
    .select("id, name, prefecture_id");
  if (muniError) throw muniError;

  const areaLookup = new Map((areas ?? []).map((area) => [area.id, area]));
  const prefLookup = new Map((prefectures ?? []).map((pref) => [pref.id, pref]));

  return (municipalities ?? []).map((municipality) => {
    const pref = prefLookup.get(municipality.prefecture_id);
    const area = pref ? areaLookup.get(pref.area_id) : null;
    return {
      id: municipality.id,
      municipalityName: municipality.name,
      prefectureName: pref?.name ?? "",
      areaName: area?.name ?? "",
    };
  });
}

function summarizeTemplate(template, locationLookup) {
  const mappings = sortedMappings(template);
  const category = firstRelation(template.template_categories);
  const location = template.municipality_id ? locationLookup.get(template.municipality_id) : null;
  const debug = isDebugTemplate(template);
  const duplicateTargets = findDuplicatePlaceholders(mappings);
  const emptyTargetCount = mappings.filter((mapping) => !String(mapping.placeholder ?? "").trim()).length;
  const emptyFieldCount = mappings.filter((mapping) => !String(mapping.field_path ?? "").trim()).length;
  const unknownFieldCount = mappings.filter((mapping) => {
    if (!String(mapping.field_path ?? "").trim()) return false;
    return !findField(mapping.field_path);
  }).length;
  const missingMapping = mappings.length === 0;
  const readiness = readinessStatus({
    active: template.is_active,
    debug,
    missingMapping,
    emptyTargetCount,
    emptyFieldCount,
    unknownFieldCount,
    duplicateTargetCount: duplicateTargets.length,
  });

  return {
    template_id: template.id,
    category: category?.name ?? "",
    category_slug: category?.slug ?? "",
    template_name: template.name,
    file_type: template.file_type,
    version: template.version,
    active: template.is_active ? "YES" : "NO",
    target_class: !template.is_active ? "旧版/無効" : debug ? "検証用除外" : "本番対象",
    readiness,
    action: actionForReadiness(readiness),
    case_types: formatCaseTypes(template.applicable_case_types),
    location: formatLocation(location),
    mapping_count: mappings.length,
    required_count: mappings.filter((mapping) => Boolean(mapping.is_required)).length,
    duplicate_target_count: duplicateTargets.length,
    empty_target_count: emptyTargetCount,
    empty_field_count: emptyFieldCount,
    unknown_field_count: unknownFieldCount,
    file_path: template.file_path,
    description: template.description ?? "",
    created_at: template.created_at,
    updated_at: template.updated_at,
  };
}

function buildMappingRows(template, locationLookup) {
  const category = firstRelation(template.template_categories);
  const location = template.municipality_id ? locationLookup.get(template.municipality_id) : null;
  const duplicateTargets = new Set(findDuplicatePlaceholders(sortedMappings(template)));

  return sortedMappings(template).map((mapping, index) => {
    const field = findField(mapping.field_path);
    const placeholder = String(mapping.placeholder ?? "").trim();
    const fieldPath = String(mapping.field_path ?? "").trim();
    let status = "OK";
    if (!placeholder || !fieldPath) status = "未入力";
    else if (duplicateTargets.has(normalizePlaceholder(placeholder))) status = "転記先重複";
    else if (!field) status = "辞書未登録";

    return {
      template_id: template.id,
      template_name: template.name,
      target_class: !template.is_active
        ? "旧版/無効"
        : isDebugTemplate(template)
          ? "検証用除外"
          : "本番対象",
      category: category?.name ?? "",
      location: formatLocation(location),
      file_type: template.file_type,
      version: template.version,
      row_no: index + 1,
      placeholder,
      field_path: fieldPath,
      field_label: field?.label ?? "",
      field_group: field?.group ?? "",
      label: mapping.label ?? "",
      required: mapping.is_required ? "YES" : "NO",
      status,
    };
  });
}

function buildTaskRows(templateRows) {
  return templateRows
    .flatMap((template) => {
      const tasks = [];
      if (template.target_class === "本番対象" && template.mapping_count === 0) {
        tasks.push(task(template, "高", "マッピング未設定", "Wordは{...}差し込み名、Excelはセル座標を決めて登録する"));
      }
      if (template.target_class === "本番対象" && template.empty_target_count > 0) {
        tasks.push(task(template, "高", "転記先未入力", "空の転記先行を削除するか、差し込み名/セル座標を入力する"));
      }
      if (template.target_class === "本番対象" && template.empty_field_count > 0) {
        tasks.push(task(template, "高", "フィールド未選択", "右側のフィールド辞書から対応する項目を選ぶ"));
      }
      if (template.target_class === "本番対象" && template.duplicate_target_count > 0) {
        tasks.push(task(template, "高", "転記先重複", "同じ差し込み名/セル座標を複数行で使っていないか整理する"));
      }
      if (template.target_class === "本番対象" && template.unknown_field_count > 0) {
        tasks.push(task(template, "中", "辞書未登録フィールド", "既存辞書へ寄せるか、必要ならfield-dictへ正式追加する"));
      }
      if (template.target_class === "検証用除外") {
        tasks.push(task(template, "中", "検証用active", "本番化するなら通常テンプレート化、不要なら非active化する"));
      }
      if (template.target_class === "本番対象" && template.readiness === "OK") {
        tasks.push(task(template, "低", "生成検証", "架空案件で生成し、文字残り・レイアウト崩れ・転記値を確認する"));
      }
      return tasks;
    })
    .sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority) || a.template_id - b.template_id);
}

function task(template, priority, issue, nextAction) {
  return {
    priority,
    issue,
    next_action: nextAction,
    template_id: template.template_id,
    template_name: template.template_name,
    category: template.category,
    target_class: template.target_class,
    file_type: template.file_type,
    version: template.version,
    readiness: template.readiness,
    mapping_count: template.mapping_count,
    case_types: template.case_types,
    location: template.location,
  };
}

function readinessStatus({
  active,
  debug,
  missingMapping,
  emptyTargetCount,
  emptyFieldCount,
  unknownFieldCount,
  duplicateTargetCount,
}) {
  if (!active) return "非対象";
  if (debug) return "検証用";
  if (missingMapping) return "要整備";
  if (emptyTargetCount > 0 || emptyFieldCount > 0 || duplicateTargetCount > 0) return "要修正";
  if (unknownFieldCount > 0) return "要確認";
  return "OK";
}

function actionForReadiness(readiness) {
  switch (readiness) {
    case "OK":
      return "生成検証へ進める";
    case "要整備":
      return "転記箇所と対応フィールドを登録";
    case "要修正":
      return "未入力/重複を修正";
    case "要確認":
      return "辞書未登録フィールドを確認";
    case "検証用":
      return "通常版へ昇格または非active化";
    default:
      return "旧版として保管";
  }
}

function summarizeRows(templateRows) {
  return {
    total_templates: templateRows.length,
    active_templates: templateRows.filter((row) => row.active === "YES").length,
    production_templates: templateRows.filter((row) => row.target_class === "本番対象").length,
    debug_active_templates: templateRows.filter((row) => row.target_class === "検証用除外").length,
    inactive_templates: templateRows.filter((row) => row.target_class === "旧版/無効").length,
    production_ok: templateRows.filter((row) => row.target_class === "本番対象" && row.readiness === "OK").length,
    production_needs_work: templateRows.filter((row) => row.target_class === "本番対象" && row.readiness !== "OK").length,
  };
}

async function writeWorkbook(filePath, templateRows, mappingRows, taskRows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "kanri-system";
  workbook.created = new Date();

  addSheet(workbook, "テンプレート一覧", templateRows);
  addSheet(workbook, "マッピング詳細", mappingRows);
  addSheet(workbook, "整備タスク", taskRows);
  addSheet(workbook, "フィールド辞書", FIELD_ENTRIES);

  await workbook.xlsx.writeFile(filePath);
}

function addSheet(workbook, name, rows) {
  const worksheet = workbook.addWorksheet(name);
  const headers = rows.length > 0 ? Object.keys(rows[0]) : ["empty"];
  worksheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: Math.max(12, Math.min(42, header.length + 8)),
  }));
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  for (const row of rows) worksheet.addRow(row);

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF374151" },
  };

  for (const column of worksheet.columns) {
    const key = column.key;
    let maxLength = String(column.header ?? "").length;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      maxLength = Math.max(maxLength, String(cell.value ?? "").length);
    });
    column.width = Math.max(12, Math.min(58, maxLength + 2));
    if (key === "description" || key === "file_path" || key === "next_action") {
      column.width = 46;
    }
  }

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });
}

function buildMarkdown(templateRows, taskRows, generatedAt) {
  const summary = summarizeRows(templateRows);
  const productionRows = templateRows.filter((row) => row.target_class === "本番対象");
  const debugRows = templateRows.filter((row) => row.target_class === "検証用除外");
  const highTasks = taskRows.filter((row) => row.priority === "高");
  const mediumTasks = taskRows.filter((row) => row.priority === "中");

  return [
    "# テンプレート・マッピング整備表",
    "",
    `生成日時: ${formatDateTime(generatedAt)}`,
    "",
    "## サマリー",
    "",
    `- 登録テンプレート総数: ${summary.total_templates}`,
    `- activeテンプレート: ${summary.active_templates}`,
    `- 本番対象テンプレート: ${summary.production_templates}`,
    `- 本番対象の構造OK: ${summary.production_ok}`,
    `- 本番対象の要整備/要確認: ${summary.production_needs_work}`,
    `- activeだが検証用除外: ${summary.debug_active_templates}`,
    `- 旧版/無効: ${summary.inactive_templates}`,
    "",
    "## 次に見るべきタスク",
    "",
    highTasks.length === 0
      ? "- 高優先度タスクはありません。"
      : markdownTable(highTasks, [
          "priority",
          "issue",
          "template_id",
          "template_name",
          "next_action",
        ]),
    "",
    mediumTasks.length === 0
      ? "- 中優先度タスクはありません。"
      : markdownTable(mediumTasks.slice(0, 30), [
          "priority",
          "issue",
          "template_id",
          "template_name",
          "next_action",
        ]),
    mediumTasks.length > 30 ? `\n中優先度タスクは他に ${mediumTasks.length - 30} 件あります。` : "",
    "",
    "## 本番対象テンプレート",
    "",
    markdownTable(productionRows, [
      "template_id",
      "category",
      "template_name",
      "file_type",
      "version",
      "readiness",
      "mapping_count",
      "unknown_field_count",
      "case_types",
      "location",
    ]),
    "",
    "## activeだが検証用除外",
    "",
    markdownTable(debugRows, [
      "template_id",
      "category",
      "template_name",
      "file_type",
      "version",
      "mapping_count",
      "action",
    ]),
    "",
    "## 出力ファイル",
    "",
    "- `docs/template-mapping-workplan.xlsx`",
    "- `tmp/template-mapping-workplan/templates.csv`",
    "- `tmp/template-mapping-workplan/mappings.csv`",
    "- `tmp/template-mapping-workplan/tasks.csv`",
    "- `tmp/template-mapping-workplan/template-mapping-workplan.json`",
    "",
  ].join("\n");
}

function markdownTable(rows, columns) {
  if (rows.length === 0) return "_対象なし_";
  return [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${columns.map((column) => markdownCell(row[column])).join(" | ")} |`),
  ].join("\n");
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/gu, " ")
    .replace(/\|/gu, "\\|");
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
    "",
  ].join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/u.test(text)) return text;
  return `"${text.replace(/"/gu, '""')}"`;
}

function sortedMappings(template) {
  return [...(template.template_mappings ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id,
  );
}

function isDebugTemplate(template) {
  return String(template.description ?? "").includes(DEBUG_MARKER);
}

function firstRelation(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatCaseTypes(value) {
  if (!Array.isArray(value) || value.length === 0) return "全案件種別";
  return value.map((caseType) => CASE_TYPE_LABELS[caseType] ?? caseType).join("、");
}

function formatLocation(location) {
  if (!location) return "";
  return [location.areaName, location.prefectureName, location.municipalityName]
    .filter(Boolean)
    .join(" / ");
}

function findDuplicatePlaceholders(mappings) {
  const counts = new Map();
  for (const mapping of mappings) {
    const key = normalizePlaceholder(mapping.placeholder ?? "");
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
}

function normalizePlaceholder(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeFieldLookup(input) {
  return String(input ?? "")
    .trim()
    .replace(/^\{\{?/u, "")
    .replace(/\}\}?$/u, "")
    .replace(/\s+/gu, "");
}

function findField(fieldPath) {
  return FIELD_LOOKUP.get(normalizeFieldLookup(fieldPath));
}

function buildFieldLookup(entries) {
  const lookup = new Map();
  for (const entry of entries) {
    for (const key of [entry.path, ...(entry.aliases ?? [])]) {
      lookup.set(normalizeFieldLookup(key), entry);
    }
  }
  return lookup;
}

function buildFieldEntries() {
  const coreFields = [
    field("caseNumber", "案件番号", "案件基本情報"),
    field("caseName", "案件名", "案件基本情報"),
    field("caseMemo", "案件メモ・申請理由", "案件基本情報"),
    field("caseTypeLabel", "案件種別（日本語）", "案件基本情報"),
    field("submissionTarget", "提出先", "案件基本情報"),
    field("submissionDate", "提出日（和暦）", "案件基本情報"),
    field("deadlineDate", "締切日（和暦）", "案件基本情報"),
    field("today", "生成日（和暦）", "案件基本情報"),
    field("todayYear", "生成年（和暦）", "案件基本情報"),
    field("todayMonth", "生成月", "案件基本情報"),
    field("todayDay", "生成日（日）", "案件基本情報"),
    field("parcel.pref", "所在都道府県", "土地情報（1筆目）"),
    field("parcel.city", "所在市区町村", "土地情報（1筆目）"),
    field("parcel.aza", "大字・字", "土地情報（1筆目）"),
    field("parcel.chiban", "地番", "土地情報（1筆目）"),
    field("parcel.locationFull", "所在地（市区町村〜地番）", "土地情報（1筆目）"),
    field("parcel.chimoku", "地目", "土地情報（1筆目）"),
    field("parcel.area", "地積（㎡）", "土地情報（1筆目）"),
    field("parcel.tenyoArea", "転用面積（㎡）", "土地情報（1筆目）"),
    ...buildParcelIndexFields(rangeIndexes(INDEXED_PARCEL_COUNT)),
    field("totalArea", "地積合計（㎡）", "土地情報（複数筆）"),
    field("totalTenyoArea", "転用面積合計（㎡）", "土地情報（複数筆）"),
    field("estimateAmount", "見積金額（税抜）", "金額"),
    field("estimateAmountTax", "消費税額", "金額"),
    field("estimateAmountTotal", "見積金額（税込）", "金額"),
    field("invoiceAmount", "請求金額（税抜）", "金額"),
    field("invoiceAmountTax", "請求消費税額", "金額"),
    field("invoiceAmountTotal", "請求金額（税込）", "金額"),
  ];

  const personFields = [
    ...buildPersonFields("applicant", "申請者", "申請者"),
    ...buildPersonFields("transferee", "譲受人", "譲受人"),
    ...buildPersonFields("transferor", "譲渡人", "譲渡人"),
    ...buildPersonFields("agent", "代理人/行政書士", "代理人"),
    ...buildPersonFields("billing", "請求先", "請求先", "請求先氏名・法人名"),
    ...buildPersonFields("neighbor", "隣地所有者", "隣地所有者").map((entry) => {
      if (entry.path === "neighbor.name") return { ...entry, label: "隣地所有者氏名（1人目）" };
      if (entry.path === "neighbor.addressFull") {
        return { ...entry, label: "隣地所有者住所（1人目）" };
      }
      return entry;
    }),
    ...buildIndexedPersonFields("applicants", "申請者（複数）", "申請者", [0, 1]),
    ...buildIndexedPersonFields("neighbors", "隣地所有者（複数）", "隣地所有者", [0, 1]).map(
      (entry) => {
        const match = entry.path.match(/^neighbors\[(\d+)\]\.(.+)$/u);
        const index = match?.[1] ? Number(match[1]) + 1 : 1;
        const suffix = match?.[2] ? suffixLabel(match[2]) : entry.label;
        return { ...entry, label: `隣地所有者${suffix}（${index}人目）` };
      },
    ),
  ];

  return [...coreFields, ...personFields].map(withAliases);
}

function field(pathValue, label, group) {
  return { path: pathValue, label, group };
}

function withAliases(entry) {
  const alias = toSnakeCase(entry.path);
  if (alias === entry.path) return entry;
  return { ...entry, aliases: [alias] };
}

function toSnakeCase(input) {
  return input.replace(/[A-Z]/gu, (char) => `_${char.toLowerCase()}`);
}

function rangeIndexes(count) {
  return Array.from({ length: count }, (_, index) => index);
}

function buildParcelIndexFields(indexes) {
  return indexes.flatMap((index) =>
    PARCEL_FIELD_DEFS.map(([suffix, label]) =>
      field(`parcels[${index}].${suffix}`, `${index + 1}筆目 ${label}`, "土地情報（複数筆）"),
    ),
  );
}

function buildPersonFields(key, group, labelPrefix, nameLabel) {
  return PERSON_FIELD_DEFS.map(([suffix, label]) =>
    field(
      `${key}.${suffix}`,
      suffix === "name" && nameLabel ? nameLabel : `${labelPrefix}${label}`,
      group,
    ),
  );
}

function buildIndexedPersonFields(key, group, labelPrefix, indexes) {
  return indexes.flatMap((index) =>
    ["name", "addressFull", "phone", "email"].map((suffix) =>
      field(`${key}[${index}].${suffix}`, `${index + 1}人目 ${labelPrefix}${suffixLabel(suffix)}`, group),
    ),
  );
}

function suffixLabel(suffix) {
  switch (suffix) {
    case "name":
      return "氏名";
    case "addressFull":
      return "住所（全体）";
    case "phone":
      return "電話番号";
    case "email":
      return "メール";
    default:
      return suffix;
  }
}

function priorityWeight(priority) {
  switch (priority) {
    case "高":
      return 0;
    case "中":
      return 1;
    default:
      return 2;
  }
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}
