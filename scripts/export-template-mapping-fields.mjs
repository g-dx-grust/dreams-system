import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ExcelJS from "exceljs";

const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, "docs/user-manual");
const markdownPath = path.join(outputDir, "template-mapping-fields.md");
const appendixPath = path.join(outputDir, "template-mapping-fields-appendix.md");
const csvPath = path.join(outputDir, "template-mapping-fields.csv");
const xlsxPath = path.join(outputDir, "template-mapping-fields.xlsx");

function escapeMarkdownCell(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\n", "<br />");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function noteForField(field) {
  if (field.path.startsWith("parcel.")) return "1筆目の土地情報です。";
  if (field.path.startsWith("parcels[")) return "複数筆の土地情報です。番号は0始まりです。";
  if (field.path.startsWith("applicants[")) return "複数申請者用です。番号は0始まりです。";
  if (field.path.startsWith("neighbors[")) return "複数隣地所有者用です。番号は0始まりです。";
  if (field.group.includes("複数")) return "複数データ用です。";
  return "";
}

function compileFieldDictionary() {
  const tmpDir = execFileSync("mktemp", ["-d", path.join(os.tmpdir(), "kanri-field-dict-XXXXXX")], {
    encoding: "utf8",
  }).trim();

  execFileSync(
    "pnpm",
    [
      "exec",
      "tsc",
      "src/lib/transfer/field-dict.ts",
      "--target",
      "ES2020",
      "--module",
      "commonjs",
      "--outDir",
      tmpDir,
      "--skipLibCheck",
      "--esModuleInterop",
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  return require(path.join(tmpDir, "field-dict.js"));
}

function flattenGroups(fieldGroups) {
  return fieldGroups.flatMap(({ group, fields }) =>
    fields.map((field) => ({
      group,
      label: field.label,
      path: field.path,
      wordText: `{${field.path}}`,
      aliases: field.aliases?.join(" / ") ?? "",
      note: noteForField(field),
    })),
  );
}

function buildMarkdown(fieldGroups, rows, { standalone }) {
  const title = standalone
    ? "# マッピング項目一覧（全フィールド辞書）"
    : "## 22. マッピング項目一覧（全フィールド辞書）";
  const parts = [
    title,
    "",
    "この一覧は、現在システムのフィールド辞書に登録されている全項目です。全テンプレートで全項目を使う必要はありません。各様式で必要な欄だけ選びます。",
    "",
    `- 項目数: ${rows.length} 件`,
    "- Word: `Word に入れる文字` を差し込みたい場所へ入力します",
    "- Excel: セルを選んだあと、マッピング画面で `フィールドパス` を選びます",
    "- `parcels[0]` や `neighbors[0]` の番号は 0 始まりです。`[0]` が1件目、`[1]` が2件目です",
    "",
    "### グループ別件数",
    "",
    "| グループ | 件数 |",
    "|---|---:|",
    ...fieldGroups.map(({ group, fields }) => `| ${escapeMarkdownCell(group)} | ${fields.length} |`),
    "",
  ];

  for (const { group, fields } of fieldGroups) {
    parts.push(`### ${group}`, "");
    parts.push("| 表示名 | フィールドパス | Word に入れる文字 | 別名 | 備考 |");
    parts.push("|---|---|---|---|---|");
    for (const field of fields) {
      parts.push(
        [
          escapeMarkdownCell(field.label),
          `\`${escapeMarkdownCell(field.path)}\``,
          `\`{${escapeMarkdownCell(field.path)}}\``,
          escapeMarkdownCell(field.aliases?.join(" / ") ?? ""),
          escapeMarkdownCell(noteForField(field)),
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
      );
    }
    parts.push("");
  }

  return `${parts.join("\n").trim()}\n`;
}

function buildCsv(rows) {
  const headers = ["グループ", "表示名", "フィールドパス", "Wordに入れる文字", "別名", "備考"];
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) =>
      [row.group, row.label, row.path, row.wordText, row.aliases, row.note].map(csvCell).join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

async function writeXlsx(rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "kanri-system";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("マッピング項目一覧");
  sheet.columns = [
    { header: "グループ", key: "group", width: 24 },
    { header: "表示名", key: "label", width: 32 },
    { header: "フィールドパス", key: "path", width: 32 },
    { header: "Wordに入れる文字", key: "wordText", width: 36 },
    { header: "別名", key: "aliases", width: 34 },
    { header: "備考", key: "note", width: 34 },
  ];
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  for (const row of rows) sheet.addRow(row);

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF374151" },
  };
  sheet.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });

  await workbook.xlsx.writeFile(xlsxPath);
}

async function main() {
  const { FIELD_GROUPS } = compileFieldDictionary();
  const rows = flattenGroups(FIELD_GROUPS);

  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(markdownPath, buildMarkdown(FIELD_GROUPS, rows, { standalone: true })),
    fs.writeFile(appendixPath, buildMarkdown(FIELD_GROUPS, rows, { standalone: false })),
    fs.writeFile(csvPath, buildCsv(rows)),
    writeXlsx(rows),
  ]);

  console.log(`Fields: ${rows.length}`);
  console.log(`Markdown: ${markdownPath}`);
  console.log(`Appendix: ${appendixPath}`);
  console.log(`CSV: ${csvPath}`);
  console.log(`XLSX: ${xlsxPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
