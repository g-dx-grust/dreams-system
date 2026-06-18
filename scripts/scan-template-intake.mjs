#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import PizZip from "pizzip";

const DEFAULT_SOURCE_DIR = "docs/template-intake";
const DEFAULT_OUT_DIR = "tmp/template-intake";

const TEMPLATE_EXTENSIONS = new Set([".docx", ".xlsx"]);
const CONVERT_REQUIRED_EXTENSIONS = new Set([".doc", ".xls"]);
const REFERENCE_EXTENSIONS = new Set([".pdf"]);

const TARGET_XMLS = [
  "word/document.xml",
  "word/header1.xml",
  "word/header2.xml",
  "word/header3.xml",
  "word/footer1.xml",
  "word/footer2.xml",
  "word/footer3.xml",
];

const MUNICIPALITY_CODE_RULES = [
  { pattern: /豊橋/u, code: "toyohashi_city" },
  { pattern: /豊川/u, code: "toyokawa_city" },
  { pattern: /蒲郡/u, code: "gamagori_city" },
  { pattern: /新城/u, code: "shinshiro_city" },
  { pattern: /田原/u, code: "tahara_city" },
  { pattern: /設楽/u, code: "shitara_town" },
  { pattern: /東栄/u, code: "toei_town" },
  { pattern: /豊根/u, code: "toyone_village" },
  { pattern: /浜松/u, code: "hamamatsu_city" },
  { pattern: /湖西/u, code: "kosai_city" },
];

const CATEGORY_RULES = [
  {
    slug: "land_improvement",
    name: "土地改良区",
    caseType: "land_improvement",
    pattern: /土地改良|地区除外|用水|受益地|農地転用等の通知/u,
  },
  {
    slug: "boundary_survey",
    name: "境界確定測量",
    caseType: "boundary_survey",
    pattern: /境界|官民|査定|立会|確定図|筆界/u,
  },
  {
    slug: "building_permit",
    name: "建築許可",
    caseType: "building_permit",
    pattern: /建築許可|開発許可|開発・建築|都市計画法|適合証明|60条/u,
  },
  {
    slug: "farmland_conversion",
    name: "農地転用許可",
    caseType: "farmland_conversion",
    pattern: /農地法|農地転用|農振|農用地|5条|4条|3条|非農地/u,
  },
];

const KNOWN_CATEGORY_NAMES = new Map(
  CATEGORY_RULES.map((rule) => [rule.name, rule]),
);

function printUsage() {
  console.log(`Usage: node scripts/scan-template-intake.mjs [options]

Options:
  --source-dir <dir>  新様式の置き場所（default: ${DEFAULT_SOURCE_DIR}）
  --out-dir <dir>     CSV/JSON の出力先（default: ${DEFAULT_OUT_DIR}）
  --help              このヘルプを表示

This command only scans local files. It does not update DB or Storage.
`);
}

function parseArgs(argv) {
  const options = {
    sourceDir: DEFAULT_SOURCE_DIR,
    outDir: DEFAULT_OUT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") continue;

    if (arg === "--source-dir") {
      options.sourceDir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--out-dir") {
      options.outDir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.sourceDir) throw new Error("--source-dir を指定してください。");
  if (!options.outDir) throw new Error("--out-dir を指定してください。");

  return options;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "README.md") continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b, "ja"));
}

function normalizeLabel(value) {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function inferMunicipalityCode(text) {
  for (const rule of MUNICIPALITY_CODE_RULES) {
    if (rule.pattern.test(text)) return rule.code;
  }
  return "";
}

function inferCategory(pathParts, text) {
  for (const part of pathParts) {
    const known = KNOWN_CATEGORY_NAMES.get(normalizeLabel(part));
    if (known) return known;
  }

  return (
    CATEGORY_RULES.find((rule) => rule.pattern.test(text)) ?? {
      slug: "other",
      name: "その他",
      caseType: "other",
    }
  );
}

function detectFlags(text) {
  const isOld = /旧|旧版|旧様式|編集前|old/i.test(text);
  const isExample = /記入例|記載例|参考|サンプル|sample/i.test(text);
  const isGuide =
    /手引|要領|フロー|流れ|添付書類|必要書類|一覧|注意|基準|スケジュール|連絡先|説明/i.test(
      text,
    );

  return { isOld, isExample, isGuide };
}

function classifyFile(ext, flags) {
  if (flags.isOld) return "archived_or_old";
  if (REFERENCE_EXTENSIONS.has(ext) || flags.isExample || flags.isGuide) {
    return "reference_material";
  }
  if (TEMPLATE_EXTENSIONS.has(ext)) return "generation_candidate";
  if (CONVERT_REQUIRED_EXTENSIONS.has(ext)) return "needs_conversion";
  return "unsupported";
}

function detectPlaceholdersInDocx(buffer) {
  const zip = new PizZip(buffer);
  const found = new Set();

  for (const targetPath of TARGET_XMLS) {
    const file = zip.file(targetPath);
    if (!file) continue;

    const plain = file.asText().replace(/<[^>]+>/g, "");
    for (const match of plain.matchAll(/\{([^{}#/^][^{}]*)\}/g)) {
      const key = normalizeLabel(match[1] || "");
      if (key) found.add(key);
    }
  }

  return Array.from(found).sort((a, b) => a.localeCompare(b, "ja"));
}

async function buildRow(sourceRoot, fullPath) {
  const relativePath = path.relative(sourceRoot, fullPath).split(path.sep).join("/");
  const pathParts = relativePath.split("/");
  const fileName = pathParts[pathParts.length - 1] ?? "";
  const ext = path.extname(fileName).toLowerCase();
  const baseName = normalizeLabel(path.basename(fileName, ext));
  const text = normalizeLabel(relativePath);
  const category = inferCategory(pathParts, text);
  const flags = detectFlags(text);
  const intakeStatus = classifyFile(ext, flags);
  const placeholders = ext === ".docx" ? detectPlaceholdersInDocx(await fs.readFile(fullPath)) : [];
  const manualReviewReasons = [];

  if (intakeStatus === "needs_conversion") manualReviewReasons.push("doc/docx or xls/xlsx conversion");
  if (intakeStatus === "reference_material") manualReviewReasons.push("reference or guide material");
  if (intakeStatus === "unsupported") manualReviewReasons.push("unsupported extension");
  if (ext === ".docx" && placeholders.length === 0 && intakeStatus === "generation_candidate") {
    manualReviewReasons.push("docx placeholders not found");
  }
  if (ext === ".xlsx" && intakeStatus === "generation_candidate") {
    manualReviewReasons.push("xlsx cell mapping required");
  }

  return {
    relativePath,
    fileName,
    baseName,
    ext: ext.replace(/^\./u, ""),
    intakeStatus,
    categorySlug: category.slug,
    categoryName: category.name,
    caseType: category.caseType,
    municipalityCode: inferMunicipalityCode(text),
    hasPlaceholders: placeholders.length > 0 ? "yes" : "no",
    placeholderCount: String(placeholders.length),
    placeholders: placeholders.join(" | "),
    isOld: flags.isOld ? "yes" : "no",
    isExample: flags.isExample ? "yes" : "no",
    isGuide: flags.isGuide ? "yes" : "no",
    manualReviewReasons: manualReviewReasons.join(" | "),
  };
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  if (!/[",\r\n]/u.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/gu, '""')}"`;
}

function toCsv(rows) {
  const columns = [
    "relativePath",
    "fileName",
    "baseName",
    "ext",
    "intakeStatus",
    "categorySlug",
    "categoryName",
    "caseType",
    "municipalityCode",
    "hasPlaceholders",
    "placeholderCount",
    "placeholders",
    "isOld",
    "isExample",
    "isGuide",
    "manualReviewReasons",
  ];

  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n");
}

function summarize(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[key] || "(blank)";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  const sourceRoot = path.resolve(projectRoot, options.sourceDir);
  const outDir = path.resolve(projectRoot, options.outDir);

  if (!(await pathExists(sourceRoot))) {
    console.log(`新様式フォルダがまだありません: ${options.sourceDir}`);
    console.log("共有された新様式をこのフォルダに置くか、--source-dir で場所を指定してください。");
    return;
  }

  const files = await collectFiles(sourceRoot);
  const rows = [];
  for (const file of files) {
    rows.push(await buildRow(sourceRoot, file));
  }

  await fs.mkdir(outDir, { recursive: true });
  const csvPath = path.join(outDir, "template-intake-inventory.csv");
  const jsonPath = path.join(outDir, "template-intake-inventory.json");
  await fs.writeFile(csvPath, `${toCsv(rows)}\n`, "utf8");
  await fs.writeFile(jsonPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");

  console.log(`${rows.length}件のファイルを棚卸ししました。`);
  console.log(`CSV:  ${path.relative(projectRoot, csvPath)}`);
  console.log(`JSON: ${path.relative(projectRoot, jsonPath)}`);

  console.log("");
  console.log("By intakeStatus");
  for (const [status, count] of summarize(rows, "intakeStatus")) {
    console.log(`  ${status}: ${count}`);
  }

  console.log("");
  console.log("By extension");
  for (const [ext, count] of summarize(rows, "ext")) {
    console.log(`  ${ext}: ${count}`);
  }

  console.log("");
  console.log("By category");
  for (const [category, count] of summarize(rows, "categoryName")) {
    console.log(`  ${category}: ${count}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
