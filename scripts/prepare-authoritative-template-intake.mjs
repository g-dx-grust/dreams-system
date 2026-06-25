#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import PizZip from "pizzip";
import ExcelJS from "exceljs";

const SOURCE_ROOTS = ["./●土地家屋調査士業務", "./●行政書士業務"];
const MAPPED_ROOT = "docs/新様式群_20260603/マッピング作業済み";
const DEFAULT_OUT_DIR = "docs/template-intake/20260626-authoritative";
const DEFAULT_REPORT_DIR = "tmp/template-intake-20260626-authoritative";
const TEMPLATE_EXTENSIONS = new Set([".docx", ".xlsx"]);
const LEGACY_EXTENSIONS = new Map([
  [".doc", ".docx"],
  [".xls", ".xlsx"],
]);
const IGNORED_FILE_NAMES = new Set([".DS_Store"]);
const TARGET_XMLS = [
  "word/document.xml",
  "word/header1.xml",
  "word/header2.xml",
  "word/header3.xml",
  "word/footer1.xml",
  "word/footer2.xml",
  "word/footer3.xml",
];

function printUsage() {
  console.log(`Usage: node scripts/prepare-authoritative-template-intake.mjs [options]

Options:
  --out-dir <dir>       取込用ディレクトリ（default: ${DEFAULT_OUT_DIR}）
  --report-dir <dir>    レポート出力先（default: ${DEFAULT_REPORT_DIR}）
  --skip-pdf-check      legacy変換後のPDFページ数比較を省略する
  --help                このヘルプを表示
`);
}

function parseArgs(argv) {
  const options = {
    outDir: DEFAULT_OUT_DIR,
    reportDir: DEFAULT_REPORT_DIR,
    pdfCheck: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out-dir") {
      options.outDir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--report-dir") {
      options.reportDir = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--skip-pdf-check") {
      options.pdfCheck = false;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.outDir) throw new Error("--out-dir を指定してください。");
  if (!options.reportDir) throw new Error("--report-dir を指定してください。");
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

async function collectFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (IGNORED_FILE_NAMES.has(entry.name)) continue;
    const fullPath = path.join(rootDir, entry.name);
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

function normalizeSegment(value) {
  return normalizeLabel(value).replace(/^●+/u, "");
}

function normalizeKeyPart(value) {
  return normalizeSegment(value)
    .replace(/\s+/gu, "")
    .replace(/[　]/gu, "")
    .toLowerCase();
}

function normalizedRelativeParts(relativePath) {
  return relativePath
    .split(path.sep)
    .map((segment) => normalizeSegment(segment))
    .filter(Boolean);
}

function displayRelativePath(rootDir, fullPath) {
  return path.relative(rootDir, fullPath).split(path.sep).join("/");
}

function sourceEntry(projectRoot, sourceRoot, fullPath) {
  const relativePath = displayRelativePath(sourceRoot, fullPath);
  const sourceRootLabel = normalizeSegment(path.basename(sourceRoot));
  const parts = [sourceRootLabel, ...normalizedRelativeParts(relativePath)];
  const fileName = parts.at(-1) ?? "";
  const ext = path.extname(fileName).toLowerCase();
  const stemParts = parts.slice(0, -1);
  const stem = normalizeSegment(path.basename(fileName, ext));

  return {
    sourceKind: "authoritative",
    fullPath,
    relativePath: path.relative(projectRoot, fullPath).split(path.sep).join("/"),
    normalizedRelativePath: [...stemParts, fileName].join("/"),
    normalizedOutputRelativePath: [...stemParts, `${stem}${LEGACY_EXTENSIONS.get(ext) ?? ext}`].join("/"),
    canonicalKey: [...stemParts, stem].map(normalizeKeyPart).join("/"),
    fileName,
    stem,
    ext,
    size: 0,
    sha256: "",
  };
}

function mappedEntry(projectRoot, mappedRoot, fullPath) {
  const relativePath = displayRelativePath(mappedRoot, fullPath);
  const parts = normalizedRelativeParts(relativePath);
  const fileName = parts.at(-1) ?? "";
  const ext = path.extname(fileName).toLowerCase();
  const stemParts = parts.slice(0, -1);
  const stem = normalizeSegment(path.basename(fileName, ext));

  return {
    sourceKind: "mapped",
    fullPath,
    relativePath: path.relative(projectRoot, fullPath).split(path.sep).join("/"),
    normalizedRelativePath: [...stemParts, fileName].join("/"),
    canonicalKey: [...stemParts, stem].map(normalizeKeyPart).join("/"),
    fileName,
    stem,
    ext,
    size: 0,
    sha256: "",
  };
}

async function attachFileStats(entry) {
  const buffer = await fs.readFile(entry.fullPath);
  return {
    ...entry,
    size: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

function summarizeBy(entries, getKey) {
  const counts = new Map();
  for (const entry of entries) {
    const key = getKey(entry) || "(blank)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"));
}

function compareEntries(sourceEntries, mappedEntries) {
  const mappedByKey = new Map();
  for (const entry of mappedEntries) {
    const current = mappedByKey.get(entry.canonicalKey) ?? [];
    current.push(entry);
    mappedByKey.set(entry.canonicalKey, current);
  }

  const sourceKeys = new Set(sourceEntries.map((entry) => entry.canonicalKey));
  const rows = [];

  for (const source of sourceEntries) {
    const mapped = mappedByKey.get(source.canonicalKey) ?? [];
    const sameHash = mapped.some((entry) => entry.sha256 === source.sha256);
    const sameExt = mapped.some((entry) => entry.ext === source.ext);
    const status =
      mapped.length === 0
        ? "source_only"
        : sameHash
          ? "same_file"
          : sameExt
            ? "updated_candidate"
            : "extension_changed_or_converted";

    rows.push({
      status,
      canonicalKey: source.canonicalKey,
      sourcePath: source.relativePath,
      sourceExt: source.ext,
      sourceSize: source.size,
      sourceSha256: source.sha256,
      mappedPaths: mapped.map((entry) => entry.relativePath).join(" | "),
      mappedExts: [...new Set(mapped.map((entry) => entry.ext))].join(" | "),
      mappedSha256: mapped.map((entry) => entry.sha256).join(" | "),
    });
  }

  for (const mapped of mappedEntries) {
    if (sourceKeys.has(mapped.canonicalKey)) continue;
    rows.push({
      status: "mapped_only_retire_candidate",
      canonicalKey: mapped.canonicalKey,
      sourcePath: "",
      sourceExt: "",
      sourceSize: "",
      sourceSha256: "",
      mappedPaths: mapped.relativePath,
      mappedExts: mapped.ext,
      mappedSha256: mapped.sha256,
    });
  }

  return rows.sort((a, b) => a.canonicalKey.localeCompare(b.canonicalKey, "ja"));
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/u.test(text)) return text;
  return `"${text.replace(/"/gu, '""')}"`;
}

function toCsv(rows, columns) {
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n");
}

async function writeCsv(filePath, rows, columns) {
  await fs.writeFile(filePath, `${toCsv(rows, columns)}\n`, "utf8");
}

function bundledSofficePath() {
  const candidate =
    "/Users/shojiyuya/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/soffice";
  return candidate;
}

async function findSoffice() {
  const candidate = bundledSofficePath();
  if (await pathExists(candidate)) return candidate;
  return "soffice";
}

function runCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60_000;
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

async function convertOfficeFile({ soffice, sourcePath, targetExt, outDir, profileDir }) {
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(profileDir, { recursive: true });
  const result = await runCommand(
    soffice,
    [
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      "--headless",
      "--convert-to",
      targetExt.replace(/^\./u, ""),
      "--outdir",
      outDir,
      sourcePath,
    ],
    { timeoutMs: 120_000 },
  );

  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || `soffice exited ${result.code}`).trim());
  }

  const expected = path.join(
    outDir,
    `${path.basename(sourcePath, path.extname(sourcePath))}${targetExt}`,
  );
  if (await pathExists(expected)) return expected;

  const generated = (await collectFiles(outDir)).find(
    (file) => path.extname(file).toLowerCase() === targetExt,
  );
  if (!generated) throw new Error(`converted file not found in ${outDir}`);
  return generated;
}

async function copyFileEnsuringDir(sourcePath, destPath) {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.copyFile(sourcePath, destPath);
}

function detectDocxPlaceholders(buffer) {
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

  return [...found].sort((a, b) => a.localeCompare(b, "ja"));
}

async function validateDocx(filePath) {
  const buffer = await fs.readFile(filePath);
  const zip = new PizZip(buffer);
  if (!zip.file("word/document.xml")) throw new Error("word/document.xml not found");
  const placeholders = detectDocxPlaceholders(buffer);
  return {
    packageOk: "yes",
    placeholderCount: placeholders.length,
    placeholders: placeholders.join(" | "),
    sheetCount: "",
    sheets: "",
  };
}

async function validateXlsx(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheets = workbook.worksheets.map((sheet) => {
    const rowCount = sheet.actualRowCount || sheet.rowCount || 0;
    const columnCount = sheet.actualColumnCount || sheet.columnCount || 0;
    return `${sheet.name}:${rowCount}x${columnCount}`;
  });
  return {
    packageOk: "yes",
    placeholderCount: "",
    placeholders: "",
    sheetCount: workbook.worksheets.length,
    sheets: sheets.join(" | "),
  };
}

async function convertToPdf({ soffice, sourcePath, outDir, profileDir }) {
  await fs.mkdir(outDir, { recursive: true });
  const result = await runCommand(
    soffice,
    [
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      outDir,
      sourcePath,
    ],
    { timeoutMs: 120_000 },
  );
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || `pdf conversion exited ${result.code}`).trim());
  }
  const expected = path.join(outDir, `${path.basename(sourcePath, path.extname(sourcePath))}.pdf`);
  if (await pathExists(expected)) return expected;
  const generated = (await collectFiles(outDir)).find((file) => path.extname(file).toLowerCase() === ".pdf");
  if (!generated) throw new Error(`pdf not found in ${outDir}`);
  return generated;
}

async function pdfPageCount(pdfPath) {
  const result = await runCommand("pdfinfo", [pdfPath], { timeoutMs: 30_000 });
  if (result.code !== 0) throw new Error((result.stderr || result.stdout).trim());
  const match = result.stdout.match(/^Pages:\s+(\d+)/m);
  if (!match?.[1]) throw new Error("Pages not found in pdfinfo output");
  return Number(match[1]);
}

async function validatePdfPages({ soffice, sourcePath, outputPath, workDir, profileDir }) {
  const sourcePdf = await convertToPdf({
    soffice,
    sourcePath,
    outDir: path.join(workDir, "pdf-source"),
    profileDir,
  });
  const outputPdf = await convertToPdf({
    soffice,
    sourcePath: outputPath,
    outDir: path.join(workDir, "pdf-output"),
    profileDir,
  });
  const sourcePages = await pdfPageCount(sourcePdf);
  const outputPages = await pdfPageCount(outputPdf);
  return {
    sourcePdfPages: sourcePages,
    outputPdfPages: outputPages,
    pageCountStatus: sourcePages === outputPages ? "same" : "changed",
  };
}

async function prepareIntake({ sourceEntries, projectRoot, outDir, reportDir, pdfCheck }) {
  const soffice = await findSoffice();
  const prepared = [];
  const officeWorkRoot = path.join(reportDir, "office-work");
  const profileDir = path.resolve(reportDir, "lo-profile");

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(reportDir, { recursive: true });

  for (let index = 0; index < sourceEntries.length; index += 1) {
    const entry = sourceEntries[index];
    const targetExt = LEGACY_EXTENSIONS.get(entry.ext) ?? entry.ext;
    const outputRelativePath = entry.normalizedOutputRelativePath;
    const outputPath = path.join(outDir, ...outputRelativePath.split("/"));
    const row = {
      index: index + 1,
      sourcePath: entry.relativePath,
      outputPath: path.relative(projectRoot, outputPath).split(path.sep).join("/"),
      sourceExt: entry.ext,
      outputExt: targetExt,
      action: LEGACY_EXTENSIONS.has(entry.ext) ? "converted" : "copied",
      conversionStatus: "ok",
      validationStatus: "ok",
      packageOk: "",
      sourcePdfPages: "",
      outputPdfPages: "",
      pageCountStatus: "",
      placeholderCount: "",
      placeholders: "",
      sheetCount: "",
      sheets: "",
      error: "",
    };

    try {
      if (LEGACY_EXTENSIONS.has(entry.ext)) {
        const tempOutDir = path.join(officeWorkRoot, `convert-${String(index + 1).padStart(4, "0")}`);
        const convertedPath = await convertOfficeFile({
          soffice,
          sourcePath: entry.fullPath,
          targetExt,
          outDir: tempOutDir,
          profileDir,
        });
        await copyFileEnsuringDir(convertedPath, outputPath);
      } else if (TEMPLATE_EXTENSIONS.has(entry.ext)) {
        await copyFileEnsuringDir(entry.fullPath, outputPath);
      } else {
        row.conversionStatus = "skipped_unsupported";
        row.validationStatus = "skipped";
        prepared.push(row);
        continue;
      }

      const validation =
        targetExt === ".docx" ? await validateDocx(outputPath) : await validateXlsx(outputPath);
      Object.assign(row, validation);

      if (LEGACY_EXTENSIONS.has(entry.ext) && pdfCheck) {
        const pageCheck = await validatePdfPages({
          soffice,
          sourcePath: entry.fullPath,
          outputPath,
          workDir: path.join(officeWorkRoot, `pdf-${String(index + 1).padStart(4, "0")}`),
          profileDir,
        });
        Object.assign(row, pageCheck);
      }
    } catch (error) {
      row.conversionStatus = "failed";
      row.validationStatus = "failed";
      row.error = error instanceof Error ? error.message : String(error);
    }

    prepared.push(row);
    if ((index + 1) % 25 === 0 || index + 1 === sourceEntries.length) {
      console.log(`prepared ${index + 1}/${sourceEntries.length}`);
    }
  }

  return prepared;
}

function markdownTable(rows, columns, limit = 30) {
  const shown = rows.slice(0, limit);
  const header = `| ${columns.join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = shown.map((row) => `| ${columns.map((column) => String(row[column] ?? "").replace(/\|/gu, "\\|")).join(" | ")} |`);
  return [header, separator, ...body].join("\n");
}

function buildMarkdown({
  generatedAt,
  sourceEntries,
  mappedEntries,
  compareRows,
  preparedRows,
  extensionSummary,
  mappedExtensionSummary,
  reportPaths,
}) {
  const byCompareStatus = summarizeBy(compareRows, (row) => row.status);
  const byPreparedAction = summarizeBy(preparedRows, (row) => row.action);
  const failures = preparedRows.filter((row) => row.validationStatus === "failed");
  const pageChanges = preparedRows.filter((row) => row.pageCountStatus === "changed");
  const legacyRows = sourceEntries.filter((entry) => LEGACY_EXTENSIONS.has(entry.ext));
  const unsupportedRows = sourceEntries.filter(
    (entry) => !LEGACY_EXTENSIONS.has(entry.ext) && !TEMPLATE_EXTENSIONS.has(entry.ext),
  );
  const noPlaceholderDocx = preparedRows.filter(
    (row) => row.outputExt === ".docx" && row.placeholderCount !== "" && Number(row.placeholderCount) === 0,
  );

  return `# 正本様式 取込準備レポート

- 作成日時: ${generatedAt.toISOString()}
- 正本ファイル数: ${sourceEntries.length}
- 既存マッピング済みファイル数: ${mappedEntries.length}
- 取込用ディレクトリ: \`${reportPaths.outDir}\`
- レポートディレクトリ: \`${reportPaths.reportDir}\`

## 正本フォルダ 拡張子別件数

${extensionSummary.map(([ext, count]) => `- \`${ext}\`: ${count}`).join("\n")}

## 既存マッピング済みフォルダ 拡張子別件数

${mappedExtensionSummary.map(([ext, count]) => `- \`${ext}\`: ${count}`).join("\n")}

## 比較サマリ

${byCompareStatus.map(([status, count]) => `- \`${status}\`: ${count}`).join("\n")}

## 変換サマリ

${byPreparedAction.map(([action, count]) => `- \`${action}\`: ${count}`).join("\n")}
- legacy変換対象: ${legacyRows.length}
- 変換/検証失敗: ${failures.length}
- PDFページ数差分: ${pageChanges.length}
- 差し込み欄なしdocx: ${noPlaceholderDocx.length}
- unsupported: ${unsupportedRows.length}

## 追加・更新・廃止候補（先頭30件）

${markdownTable(compareRows.filter((row) => row.status !== "same_file"), ["status", "sourcePath", "mappedPaths"], 30)}

## 変換対象（先頭30件）

${markdownTable(
  legacyRows.map((entry) => ({
    sourcePath: entry.relativePath,
    sourceExt: entry.ext,
    outputPath: path.join(reportPaths.outDir, entry.normalizedOutputRelativePath).split(path.sep).join("/"),
  })),
  ["sourcePath", "sourceExt", "outputPath"],
  30,
)}

## 確認が必要な変換結果

${failures.length === 0 ? "- なし" : markdownTable(failures, ["sourcePath", "outputPath", "error"], 50)}

## PDFページ数差分

${pageChanges.length === 0 ? "- なし" : markdownTable(pageChanges, ["sourcePath", "sourcePdfPages", "outputPdfPages"], 50)}

## 出力ファイル

- 比較CSV: \`${reportPaths.compareCsv}\`
- 正本ファイルCSV: \`${reportPaths.sourceCsv}\`
- 変換対象CSV: \`${reportPaths.legacyCsv}\`
- 取込準備CSV: \`${reportPaths.preparedCsv}\`
- 取込準備JSON: \`${reportPaths.preparedJson}\`
`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  const outDir = path.resolve(projectRoot, options.outDir);
  const reportDir = path.resolve(projectRoot, options.reportDir);

  const sourceEntries = [];
  for (const root of SOURCE_ROOTS) {
    const sourceRoot = path.resolve(projectRoot, root);
    const files = await collectFiles(sourceRoot);
    for (const file of files) {
      sourceEntries.push(await attachFileStats(sourceEntry(projectRoot, sourceRoot, file)));
    }
  }

  const mappedRoot = path.resolve(projectRoot, MAPPED_ROOT);
  const mappedFiles = (await pathExists(mappedRoot)) ? await collectFiles(mappedRoot) : [];
  const mappedEntries = [];
  for (const file of mappedFiles) {
    mappedEntries.push(await attachFileStats(mappedEntry(projectRoot, mappedRoot, file)));
  }

  const compareRows = compareEntries(sourceEntries, mappedEntries);
  const preparedRows = await prepareIntake({
    sourceEntries,
    projectRoot,
    outDir,
    reportDir,
    pdfCheck: options.pdfCheck,
  });

  const extensionSummary = summarizeBy(sourceEntries, (entry) => entry.ext || "(none)");
  const mappedExtensionSummary = summarizeBy(mappedEntries, (entry) => entry.ext || "(none)");
  const legacyRows = sourceEntries
    .filter((entry) => LEGACY_EXTENSIONS.has(entry.ext))
    .map((entry) => ({
      sourcePath: entry.relativePath,
      sourceExt: entry.ext,
      targetExt: LEGACY_EXTENSIONS.get(entry.ext),
      outputPath: path.relative(projectRoot, path.join(outDir, ...entry.normalizedOutputRelativePath.split("/"))).split(path.sep).join("/"),
    }));

  await fs.mkdir(reportDir, { recursive: true });
  const compareCsv = path.join(reportDir, "source-vs-mapped.csv");
  const sourceCsv = path.join(reportDir, "source-files.csv");
  const legacyCsv = path.join(reportDir, "legacy-conversion-targets.csv");
  const preparedCsv = path.join(reportDir, "prepared-files.csv");
  const preparedJson = path.join(reportDir, "prepared-files.json");
  const markdownPath = path.join(reportDir, "summary.md");

  await Promise.all([
    writeCsv(compareCsv, compareRows, [
      "status",
      "canonicalKey",
      "sourcePath",
      "sourceExt",
      "sourceSize",
      "sourceSha256",
      "mappedPaths",
      "mappedExts",
      "mappedSha256",
    ]),
    writeCsv(sourceCsv, sourceEntries, [
      "relativePath",
      "normalizedRelativePath",
      "normalizedOutputRelativePath",
      "canonicalKey",
      "ext",
      "size",
      "sha256",
    ]),
    writeCsv(legacyCsv, legacyRows, ["sourcePath", "sourceExt", "targetExt", "outputPath"]),
    writeCsv(preparedCsv, preparedRows, [
      "index",
      "sourcePath",
      "outputPath",
      "sourceExt",
      "outputExt",
      "action",
      "conversionStatus",
      "validationStatus",
      "packageOk",
      "sourcePdfPages",
      "outputPdfPages",
      "pageCountStatus",
      "placeholderCount",
      "placeholders",
      "sheetCount",
      "sheets",
      "error",
    ]),
    fs.writeFile(`${preparedJson}`, `${JSON.stringify(preparedRows, null, 2)}\n`, "utf8"),
  ]);

  const reportPaths = {
    outDir: path.relative(projectRoot, outDir).split(path.sep).join("/"),
    reportDir: path.relative(projectRoot, reportDir).split(path.sep).join("/"),
    compareCsv: path.relative(projectRoot, compareCsv).split(path.sep).join("/"),
    sourceCsv: path.relative(projectRoot, sourceCsv).split(path.sep).join("/"),
    legacyCsv: path.relative(projectRoot, legacyCsv).split(path.sep).join("/"),
    preparedCsv: path.relative(projectRoot, preparedCsv).split(path.sep).join("/"),
    preparedJson: path.relative(projectRoot, preparedJson).split(path.sep).join("/"),
  };

  await fs.writeFile(
    markdownPath,
    buildMarkdown({
      generatedAt: new Date(),
      sourceEntries,
      mappedEntries,
      compareRows,
      preparedRows,
      extensionSummary,
      mappedExtensionSummary,
      reportPaths,
    }),
    "utf8",
  );

  const failed = preparedRows.filter((row) => row.validationStatus === "failed").length;
  const pageChanged = preparedRows.filter((row) => row.pageCountStatus === "changed").length;

  console.log("");
  console.log("Summary");
  console.log(`  source files: ${sourceEntries.length}`);
  console.log(`  mapped files: ${mappedEntries.length}`);
  console.log(`  converted:    ${preparedRows.filter((row) => row.action === "converted").length}`);
  console.log(`  copied:       ${preparedRows.filter((row) => row.action === "copied").length}`);
  console.log(`  failed:       ${failed}`);
  console.log(`  page changed: ${pageChanged}`);
  console.log(`  outDir:       ${reportPaths.outDir}`);
  console.log(`  report:       ${path.relative(projectRoot, markdownPath).split(path.sep).join("/")}`);

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
