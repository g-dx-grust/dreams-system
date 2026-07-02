// docs/様式 配下の実テンプレート全件を Supabase 抜きで転記に通すオフラインコーパステスト。
// see: docs/transfer-engine-hardening-instructions.md §2.2
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import ExcelJS from "exceljs";
import { fillDocx } from "@/lib/transfer/docx";
import { fillXlsx } from "@/lib/transfer/xlsx";
import { suggestFieldEntry } from "@/lib/transfer/field-dict";
import { SAMPLE_TRANSFER_CONTEXT } from "../fixtures/transfer-context";

const CORPUS_ROOT = path.join(process.cwd(), "docs", "様式");
const OUTPUT_ROOT = path.join(process.cwd(), "tmp", "template-corpus");
const TEST_TIMEOUT = 60_000;

function collectCorpusFiles(extension: ".docx" | ".xlsx"): string[] {
  if (!fs.existsSync(CORPUS_ROOT)) return [];

  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      // "~$" は Office のロックファイルなので除外する。
      if (entry.name.startsWith("~$")) continue;
      if (entry.name.toLowerCase().endsWith(extension)) results.push(fullPath);
    }
  };
  walk(CORPUS_ROOT);
  return results.sort();
}

function relativeCorpusPath(fullPath: string): string {
  return path.relative(CORPUS_ROOT, fullPath);
}

function readTemplate(fullPath: string): ArrayBuffer {
  const buffer = fs.readFileSync(fullPath);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function writeCorpusOutput(kind: "word" | "excel", fullPath: string, output: Buffer) {
  const target = path.join(OUTPUT_ROOT, kind, relativeCorpusPath(fullPath));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output);
}

function extractDocxText(zip: PizZip): string {
  const texts: string[] = [];
  for (const fileName of Object.keys(zip.files)) {
    if (!/^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/u.test(fileName)) {
      continue;
    }
    const xml = zip.file(fileName)?.asText() ?? "";
    texts.push(
      xml
        .replace(/<w:tab\b[^>]*\/>/gu, "\t")
        .replace(/<w:br\b[^>]*\/>/gu, "\n")
        .replace(/<[^>]+>/gu, ""),
    );
  }
  return texts.join("\n");
}

// 本文中の全角括弧や数式を誤検出しないよう、既知 fieldPath に解決できるトークンだけを
// 「未処理の残骸」と判定する。
function findUnresolvedKnownTokens(text: string): string[] {
  const unresolved = new Set<string>();
  for (const match of text.matchAll(/\{([^{}\n]{1,80})\}/gu)) {
    const token = match[1]?.trim() ?? "";
    if (!token) continue;
    if (suggestFieldEntry(token)) unresolved.add(token);
  }
  return Array.from(unresolved).sort();
}

function isWellFormedXml(xml: string | undefined): boolean {
  if (!xml) return false;
  const parsed = new DOMParser().parseFromString(xml, "text/xml");
  return parsed.getElementsByTagName("parsererror").length === 0;
}

const docxFiles = collectCorpusFiles(".docx");
const xlsxFiles = collectCorpusFiles(".xlsx");

describe.skipIf(docxFiles.length === 0)("テンプレートコーパス（Word）", () => {
  it.each(docxFiles.map((fullPath) => [relativeCorpusPath(fullPath), fullPath]))(
    "%s を転記してもパッケージが壊れない",
    (_relPath, fullPath) => {
      const template = readTemplate(fullPath);
      const output = fillDocx(template, SAMPLE_TRANSFER_CONTEXT, false);

      const zip = new PizZip(output);
      expect(zip.file("word/document.xml")?.asText()).toBeTruthy();
      expect(Object.keys(zip.files)[0]).toBe("[Content_Types].xml");
      expect(Object.values(zip.files).filter((file) => file.dir)).toHaveLength(0);

      expect(findUnresolvedKnownTokens(extractDocxText(zip))).toEqual([]);

      // 入力側が整形式だった XML パートは、出力でも整形式であること（Word の修復ダイアログ対策）。
      const inputZip = new PizZip(template);
      for (const fileName of Object.keys(zip.files)) {
        const file = zip.files[fileName];
        if (!file || file.dir || !/^word\/.+\.xml$/u.test(fileName)) continue;
        if (!isWellFormedXml(inputZip.file(fileName)?.asText())) continue;
        expect(isWellFormedXml(file.asText()), `${fileName} が整形式ではありません`).toBe(true);
      }

      writeCorpusOutput("word", fullPath, output);
    },
    TEST_TIMEOUT,
  );
});

describe.skipIf(xlsxFiles.length === 0)("テンプレートコーパス（Excel）", () => {
  it.each(xlsxFiles.map((fullPath) => [relativeCorpusPath(fullPath), fullPath]))(
    "%s を転記しても再ロードできる",
    async (_relPath, fullPath) => {
      const templateBuffer = readTemplate(fullPath);

      const inputWorkbook = new ExcelJS.Workbook();
      await inputWorkbook.xlsx.load(
        Buffer.from(templateBuffer) as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0],
      );
      const inputSheetNames = inputWorkbook.worksheets.map((sheet) => sheet.name);

      const output = await fillXlsx(templateBuffer, SAMPLE_TRANSFER_CONTEXT, [], false);

      const outputWorkbook = new ExcelJS.Workbook();
      await outputWorkbook.xlsx.load(
        Buffer.from(output) as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0],
      );
      expect(outputWorkbook.worksheets.map((sheet) => sheet.name)).toEqual(inputSheetNames);

      writeCorpusOutput("excel", fullPath, output);
    },
    TEST_TIMEOUT,
  );
});
