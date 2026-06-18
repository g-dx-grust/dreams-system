#!/usr/bin/env node

import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import PizZip from "pizzip";
import ExcelJS from "exceljs";

const DEFAULT_SOURCE_DIR = "docs/新様式群_20260603";
const DEFAULT_OUT_DIR = "tmp/template-color-fields";

const DOCX_PARTS = [
  "word/document.xml",
  "word/header1.xml",
  "word/header2.xml",
  "word/header3.xml",
  "word/footer1.xml",
  "word/footer2.xml",
  "word/footer3.xml",
];

const FIELD_CATALOG = [
  { path: "caseNumber", label: "案件番号", group: "案件基本情報" },
  { path: "caseName", label: "案件名", group: "案件基本情報" },
  { path: "caseMemo", label: "案件メモ・申請理由", group: "案件基本情報" },
  { path: "submissionTarget", label: "提出先", group: "案件基本情報" },
  { path: "submissionDate", label: "提出日（和暦）", group: "案件基本情報" },
  { path: "deadlineDate", label: "締切日（和暦）", group: "案件基本情報" },
  { path: "today", label: "生成日（和暦）", group: "案件基本情報" },
  { path: "applicant.name", label: "申請者氏名", group: "申請者" },
  { path: "applicant.nameKana", label: "申請者フリガナ", group: "申請者" },
  { path: "applicant.zip", label: "申請者郵便番号", group: "申請者" },
  { path: "applicant.addressFull", label: "申請者住所", group: "申請者" },
  { path: "applicant.addressNoPref", label: "申請者住所（都道府県除く）", group: "申請者" },
  { path: "applicant.phone", label: "申請者電話番号", group: "申請者" },
  { path: "applicant.fax", label: "申請者FAX", group: "申請者" },
  { path: "applicant.email", label: "申請者メール", group: "申請者" },
  { path: "applicant.representativeName", label: "申請者代表者氏名", group: "申請者" },
  { path: "transferee.name", label: "譲受人氏名", group: "譲受人" },
  { path: "transferee.addressFull", label: "譲受人住所", group: "譲受人" },
  { path: "transferee.phone", label: "譲受人電話番号", group: "譲受人" },
  { path: "transferor.name", label: "譲渡人氏名", group: "譲渡人" },
  { path: "transferor.addressFull", label: "譲渡人住所", group: "譲渡人" },
  { path: "transferor.phone", label: "譲渡人電話番号", group: "譲渡人" },
  { path: "agent.name", label: "代理人/行政書士氏名", group: "代理人/行政書士" },
  { path: "agent.addressFull", label: "代理人/行政書士住所", group: "代理人/行政書士" },
  { path: "agent.phone", label: "代理人/行政書士電話番号", group: "代理人/行政書士" },
  { path: "agent.fax", label: "代理人/行政書士FAX", group: "代理人/行政書士" },
  { path: "agent.email", label: "代理人/行政書士メール", group: "代理人/行政書士" },
  { path: "agent.representativeName", label: "代理人/行政書士代表者氏名", group: "代理人/行政書士" },
  { path: "billing.name", label: "請求先氏名・法人名", group: "請求先" },
  { path: "billing.addressFull", label: "請求先住所", group: "請求先" },
  { path: "billing.phone", label: "請求先電話番号", group: "請求先" },
  { path: "neighbor.name", label: "隣地所有者氏名（1人目）", group: "隣地所有者" },
  { path: "neighbor.addressFull", label: "隣地所有者住所（1人目）", group: "隣地所有者" },
  { path: "neighbors[0].name", label: "隣地所有者氏名（1人目）", group: "隣地所有者（複数）" },
  { path: "neighbors[1].name", label: "隣地所有者氏名（2人目）", group: "隣地所有者（複数）" },
  { path: "parcel.pref", label: "所在都道府県", group: "土地情報" },
  { path: "parcel.city", label: "所在市区町村", group: "土地情報" },
  { path: "parcel.oaza", label: "大字", group: "土地情報" },
  { path: "parcel.aza", label: "字", group: "土地情報" },
  { path: "parcel.oazaAza", label: "大字＋字", group: "土地情報" },
  { path: "parcel.chiban", label: "地番", group: "土地情報" },
  { path: "parcel.locationFull", label: "所在地（市区町村〜地番）", group: "土地情報" },
  { path: "parcel.chimoku", label: "地目", group: "土地情報" },
  { path: "parcel.area", label: "地積", group: "土地情報" },
  { path: "parcel.tenyoArea", label: "転用面積", group: "土地情報" },
  { path: "totalArea", label: "地積合計", group: "土地情報" },
  { path: "totalTenyoArea", label: "転用面積合計", group: "土地情報" },
  { path: "estimateAmount", label: "見積金額", group: "金額" },
  { path: "invoiceAmount", label: "請求金額", group: "金額" },
];

const CATEGORY_BY_COLOR = {
  yellow: "氏名",
  red: "住所",
  green: "電話番号",
  purple: "申請場所",
  magenta: "申請場所",
};

const INDEXED_COLORS = {
  0: "000000",
  1: "FFFFFF",
  2: "FF0000",
  3: "00FF00",
  4: "0000FF",
  5: "FFFF00",
  6: "FF00FF",
  7: "00FFFF",
  8: "000000",
  9: "FFFFFF",
  10: "FF0000",
  11: "00FF00",
  12: "0000FF",
  13: "FFFF00",
  14: "FF00FF",
  15: "00FFFF",
  16: "800000",
  17: "008000",
  18: "000080",
  19: "808000",
  20: "800080",
  21: "008080",
  22: "C0C0C0",
  23: "808080",
  24: "9999FF",
  25: "993366",
  26: "FFFFCC",
  27: "CCFFFF",
  28: "660066",
  29: "FF8080",
  30: "0066CC",
  31: "CCCCFF",
  32: "000080",
  33: "FF00FF",
  34: "FFFF00",
  35: "00FFFF",
  36: "800080",
  37: "800000",
  38: "008080",
  39: "0000FF",
  40: "00CCFF",
  41: "CCFFFF",
  42: "CCFFCC",
  43: "FFFF99",
  44: "99CCFF",
  45: "FF99CC",
  46: "CC99FF",
  47: "FFCC99",
  48: "3366FF",
  49: "33CCCC",
  50: "99CC00",
  51: "FFCC00",
  52: "FF9900",
  53: "FF6600",
  54: "666699",
  55: "969696",
  56: "003366",
  57: "339966",
  58: "003300",
  59: "333300",
  60: "993300",
  61: "993366",
  62: "333399",
  63: "333333",
};

function printUsage() {
  console.log(`Usage: node scripts/extract-colored-template-fields.mjs [options]

Options:
  --source-dir <dir>    色分け済み様式のフォルダ（default: ${DEFAULT_SOURCE_DIR}）
  --out-dir <dir>       CSV/JSON/MD の出力先（default: ${DEFAULT_OUT_DIR}）
  --no-convert-doc      .doc を textutil で一時 docx 変換しない
  --include-theme-colors Excel の theme 色も抽出する
  --include-unknown-colors gray/other など用途不明色も抽出する
  --help                このヘルプを表示

This command only scans local files. It does not update DB or Storage.
`);
}

function parseArgs(argv) {
  const options = {
    sourceDir: DEFAULT_SOURCE_DIR,
    outDir: DEFAULT_OUT_DIR,
    convertDoc: true,
    includeThemeColors: false,
    includeUnknownColors: false,
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

    if (arg === "--no-convert-doc") {
      options.convertDoc = false;
      continue;
    }

    if (arg === "--include-theme-colors") {
      options.includeThemeColors = true;
      continue;
    }

    if (arg === "--include-unknown-colors") {
      options.includeUnknownColors = true;
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

async function collectFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.startsWith("~$")) continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b, "ja"));
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim();
}

function decodeXmlText(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function xmlText(value) {
  return decodeXmlText(
    value
      .replace(/<w:tab\b[^>]*\/>/gu, "\t")
      .replace(/<w:br\b[^>]*\/>/gu, "\n")
      .replace(/<[^>]+>/gu, ""),
  );
}

function getTag(xml, tagName) {
  return (
    xml.match(new RegExp(`<${tagName}\\b[\\s\\S]*?</${tagName}>`, "u"))?.[0] ??
    xml.match(new RegExp(`<${tagName}\\b[^>]*/>`, "u"))?.[0] ??
    ""
  );
}

function getAttr(tagXml, attrName) {
  return tagXml.match(new RegExp(`${attrName}="([^"]+)"`, "u"))?.[1] ?? "";
}

function docxRunColor(runXml) {
  const rPr = getTag(runXml, "w:rPr");
  if (!rPr) return null;

  const highlight = getAttr(getTag(rPr, "w:highlight"), "w:val");
  if (highlight && highlight !== "none" && highlight !== "clear") {
    return { kind: "highlight", value: highlight, raw: `highlight:${highlight}` };
  }

  const shadingFill = getAttr(getTag(rPr, "w:shd"), "w:fill");
  if (shadingFill && !["auto", "FFFFFF", "ffffff"].includes(shadingFill)) {
    return { kind: "shading", value: shadingFill.toUpperCase(), raw: `shading:${shadingFill}` };
  }

  const fontColor = getAttr(getTag(rPr, "w:color"), "w:val");
  if (fontColor && !["auto", "000000", "000"].includes(fontColor)) {
    return { kind: "font", value: fontColor.toUpperCase(), raw: `font:${fontColor}` };
  }

  return null;
}

function normalizeHex(value) {
  const raw = String(value ?? "").replace(/^#/u, "").toUpperCase();
  if (/^[0-9A-F]{8}$/u.test(raw)) return raw.slice(2);
  if (/^[0-9A-F]{6}$/u.test(raw)) return raw;
  return "";
}

function hexToColorName(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return "";

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  if (r > 180 && g > 180 && b > 180) return "gray";
  if (r > 220 && g > 220 && b < 140) return "yellow";
  if (r > 190 && r > g + 50 && r > b + 50) return "red";
  if (g > 150 && g > r + 40 && g > b + 40) return "green";
  if (r > 130 && b > 130 && Math.abs(r - b) < 90 && g < Math.max(r, b) - 35) return "purple";
  if (b > 170 && b > r + 50 && b > g + 30) return "blue";
  if (r > 220 && g > 120 && b < 140) return "orange";
  return "other";
}

function colorNameFromDocx(value) {
  const lower = String(value ?? "").toLowerCase();
  if (["yellow", "red", "green", "blue", "cyan", "magenta"].includes(lower)) {
    return lower === "magenta" ? "purple" : lower;
  }
  if (lower === "darkyellow") return "yellow";
  if (lower === "darkred") return "red";
  if (lower === "darkgreen") return "green";
  if (lower === "darkmagenta") return "purple";
  return hexToColorName(value);
}

function excelColorToRaw(color) {
  if (!color) return "";
  if (color.argb) return `argb:${String(color.argb).toUpperCase()}`;
  if (color.rgb) return `rgb:${String(color.rgb).toUpperCase()}`;
  if (color.indexed != null) return `indexed:${color.indexed}`;
  if (color.theme != null) {
    const tint = color.tint == null ? "" : `,tint:${color.tint}`;
    return `theme:${color.theme}${tint}`;
  }
  return JSON.stringify(color);
}

function excelColorToHex(color) {
  if (!color) return "";
  if (color.argb) return normalizeHex(color.argb);
  if (color.rgb) return normalizeHex(color.rgb);
  if (color.indexed != null) return INDEXED_COLORS[color.indexed] ?? "";
  return "";
}

function isDefaultLikeExcelColor(raw, hex) {
  if (!raw) return true;
  if (raw === "indexed:64") return true;
  if (/^theme:0(?:,|$)/u.test(raw)) return true;
  if (["000000", "FFFFFF"].includes(hex)) return true;
  return false;
}

function cellValueText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  if (value.text != null) return String(value.text);
  if (value.result != null) return String(value.result);
  if (value.formula != null) return String(value.formula);
  if (value.hyperlink != null && value.text != null) return String(value.text);
  return "";
}

function nearestExcelLabel(sheet, rowNumber, colNumber) {
  const leftLabels = [];
  for (let col = colNumber - 1; col >= Math.max(1, colNumber - 4); col -= 1) {
    const value = normalizeText(cellValueText(sheet.getCell(rowNumber, col).value));
    if (value) leftLabels.push(value);
  }

  const upperLabels = [];
  for (let row = rowNumber - 1; row >= Math.max(1, rowNumber - 3); row -= 1) {
    const value = normalizeText(cellValueText(sheet.getCell(row, colNumber).value));
    if (value) upperLabels.push(value);
  }

  return [...leftLabels, ...upperLabels].slice(0, 4).join(" / ");
}

function roleFromText(text) {
  if (/譲受|買主|借主/u.test(text)) return "transferee";
  if (/譲渡|売主|貸主/u.test(text)) return "transferor";
  if (/代理|受任|行政書士|調査士|担当者/u.test(text)) return "agent";
  if (/請求|宛名/u.test(text)) return "billing";
  if (/隣地|隣接|関係土地所有者|所有者等/u.test(text)) return "neighbor";
  return "applicant";
}

function pickPersonField(role, suffix) {
  if (role === "neighbor") {
    if (suffix === "name") return "neighbor.name";
    if (suffix === "addressFull") return "neighbor.addressFull";
  }
  return `${role}.${suffix}`;
}

function fieldByPath(pathValue) {
  return FIELD_CATALOG.find((field) => field.path === pathValue) ?? null;
}

function shouldKeepColor(colorName, options) {
  if (!colorName) return options.includeUnknownColors;
  if (["gray", "other"].includes(colorName)) return options.includeUnknownColors;
  return true;
}

function suggestField(args) {
  const text = normalizeText([args.valueText, args.labelText, args.contextText].join(" "));
  const colorMeaning = CATEGORY_BY_COLOR[args.colorName] ?? "";
  const role = roleFromText(text);
  const search = text;

  let pathValue = "";
  let requirement = "";

  if (/FAX|ＦＡＸ|ファックス/u.test(search)) {
    pathValue = pickPersonField(role, "fax");
    requirement = "FAX";
  } else if (/メール|E-?mail|mail|Email/u.test(search)) {
    pathValue = pickPersonField(role, "email");
    requirement = "メール";
  } else if (/電話|TEL|ＴＥＬ|Mobile|携帯/u.test(search)) {
    pathValue = pickPersonField(role, "phone");
    requirement = "電話番号";
  } else if (/郵便|〒|zip/u.test(search)) {
    pathValue = pickPersonField(role, "zip");
    requirement = "郵便番号";
  } else if (/フリガナ|ふりがな|カナ/u.test(search)) {
    pathValue = pickPersonField(role, "nameKana");
    requirement = "フリガナ";
  } else if (/代表者/u.test(search)) {
    pathValue = pickPersonField(role, "representativeName");
    requirement = "代表者氏名";
  } else if (/氏名|名前|お客様名|申請者|所有者|委任者|受任者|宛名|調査士名|担当者/u.test(search)) {
    pathValue = pickPersonField(role, "name");
    requirement = "氏名";
  } else if (/住所|所在地|居所/u.test(search)) {
    if (/土地|申請地|所在|地番|筆/u.test(search)) {
      pathValue = "parcel.locationFull";
      requirement = "申請場所・土地所在地";
    } else {
      pathValue = pickPersonField(role, "addressFull");
      requirement = "住所";
    }
  } else if (/申請地|申請場所|場所|土地の所在|土地所在地/u.test(search)) {
    pathValue = "parcel.locationFull";
    requirement = "申請場所・土地所在地";
  } else if (/地番/u.test(search)) {
    pathValue = "parcel.chiban";
    requirement = "地番";
  } else if (/地目/u.test(search)) {
    pathValue = "parcel.chimoku";
    requirement = "地目";
  } else if (/転用.*面積|転用面積/u.test(search)) {
    pathValue = "parcel.tenyoArea";
    requirement = "転用面積";
  } else if (/報酬|基準額|小計|合計|請求|見積|領収|調整額|登記事項|手数料|税/u.test(search)) {
    requirement = "金額・費用項目";
  } else if (/地積|面積/u.test(search)) {
    pathValue = "parcel.area";
    requirement = "地積・面積";
  } else if (/提出先|あて先|宛先|市長|農業委員会/u.test(search)) {
    pathValue = "submissionTarget";
    requirement = "提出先";
  } else if (/申請日|届出日|年月日|日付|令和|年 月 日/u.test(search)) {
    pathValue = "today";
    requirement = "日付";
  } else if (/業務番号|案件番号|リストＮｏ|リストNo/u.test(search)) {
    pathValue = "caseNumber";
    requirement = "案件番号";
  } else if (/案件名|件名/u.test(search)) {
    pathValue = "caseName";
    requirement = "案件名";
  } else if (colorMeaning) {
    requirement = colorMeaning;
    if (colorMeaning === "氏名") pathValue = pickPersonField(role, "name");
    if (colorMeaning === "住所") pathValue = pickPersonField(role, "addressFull");
    if (colorMeaning === "電話番号") pathValue = pickPersonField(role, "phone");
    if (colorMeaning === "申請場所") pathValue = "parcel.locationFull";
  }

  const field = pathValue ? fieldByPath(pathValue) : null;
  return {
    requirement,
    suggestedFieldPath: field?.path ?? pathValue,
    suggestedFieldLabel: field?.label ?? "",
    dbStatus: field ? "existing" : pathValue ? "needs_field_catalog_review" : "review_required",
  };
}

function makeHashPath(input) {
  const hash = createHash("sha1").update(input).digest("hex").slice(0, 12);
  return hash;
}

async function convertDocToDocx(inputPath, convertedRoot) {
  const outputPath = path.join(convertedRoot, `${makeHashPath(inputPath)}.docx`);
  await fs.mkdir(convertedRoot, { recursive: true });
  execFileSync("textutil", ["-convert", "docx", "-output", outputPath, inputPath], {
    stdio: "pipe",
  });
  return outputPath;
}

function baseRow({ sourceRoot, filePath, convertedFrom }) {
  const relativePath = path.relative(sourceRoot, convertedFrom || filePath).split(path.sep).join("/");
  return {
    templatePath: relativePath,
    sourceFormat: path.extname(convertedFrom || filePath).replace(/^\./u, "").toLowerCase(),
    extractedFrom: convertedFrom ? "converted_docx" : "original",
  };
}

function scanDocx({ sourceRoot, filePath, convertedFrom, options }) {
  const buffer = PizZip(readFileSync(filePath));
  const rows = [];
  const base = baseRow({ sourceRoot, filePath, convertedFrom });

  for (const part of DOCX_PARTS) {
    const file = buffer.file(part);
    if (!file) continue;

    const xml = file.asText();
    const paragraphs = Array.from(xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu));
    paragraphs.forEach((paragraphMatch, paragraphIndex) => {
      const paragraphXml = paragraphMatch[0];
      const contextText = normalizeText(xmlText(paragraphXml));
      const runs = Array.from(paragraphXml.matchAll(/<w:r\b[\s\S]*?<\/w:r>/gu));
      let active = null;

      function flush() {
        if (!active) return;
        const valueText = normalizeText(active.text) || "（空欄）";
        const colorName = active.colorName;
        if (!shouldKeepColor(colorName, options)) {
          active = null;
          return;
        }
        const suggestion = suggestField({
          valueText,
          labelText: "",
          contextText,
          colorName,
        });
        rows.push({
          ...base,
          locationType: "docx_run",
          sheetOrPart: part,
          address: `paragraph:${paragraphIndex + 1}`,
          colorKind: active.color.kind,
          colorRaw: active.color.raw,
          colorName,
          valueText,
          labelText: "",
          contextText,
          ...suggestion,
        });
        active = null;
      }

      for (const runMatch of runs) {
        const runXml = runMatch[0];
        const color = docxRunColor(runXml);
        const rawText = xmlText(runXml);
        if (!color) {
          flush();
          continue;
        }

        const colorName = colorNameFromDocx(color.value);
        const key = `${color.kind}:${color.value}`;
        if (active && active.key === key) {
          active.text += rawText;
        } else {
          flush();
          active = { key, text: rawText, color, colorName };
        }
      }
      flush();
    });
  }

  return rows;
}

async function scanXlsx({ sourceRoot, filePath, options }) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const rows = [];
  const base = baseRow({ sourceRoot, filePath });

  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const fillColor = cell.fill?.fgColor ?? cell.fill?.bgColor ?? null;
        const fontColor = cell.font?.color ?? null;
        const fillRaw = excelColorToRaw(fillColor);
        const fillHex = excelColorToHex(fillColor);
        const fontRaw = excelColorToRaw(fontColor);
        const fontHex = excelColorToHex(fontColor);

        let colorKind = "";
        let colorRaw = "";
        let colorName = "";
        if (!isDefaultLikeExcelColor(fillRaw, fillHex)) {
          if (!options.includeThemeColors && fillRaw.startsWith("theme:") && !fillHex) return;
          colorKind = "fill";
          colorRaw = fillRaw;
          colorName = hexToColorName(fillHex);
        } else if (!isDefaultLikeExcelColor(fontRaw, fontHex)) {
          if (!options.includeThemeColors && fontRaw.startsWith("theme:") && !fontHex) return;
          colorKind = "font";
          colorRaw = fontRaw;
          colorName = hexToColorName(fontHex);
        }

        if (!colorKind) return;
        if (!shouldKeepColor(colorName, options)) return;

        const valueText = normalizeText(cellValueText(cell.value));
        const labelText = nearestExcelLabel(sheet, rowNumber, colNumber);
        const contextText = normalizeText([labelText, valueText].filter(Boolean).join(" / "));
        const suggestion = suggestField({
          valueText,
          labelText,
          contextText,
          colorName,
        });

        rows.push({
          ...base,
          locationType: "xlsx_cell",
          sheetOrPart: sheet.name,
          address: cell.address,
          colorKind,
          colorRaw,
          colorName,
          valueText: valueText || "（空欄）",
          labelText,
          contextText,
          ...suggestion,
        });
      });
    });
  });

  return rows;
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  if (!/[",\r\n]/u.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/gu, '""')}"`;
}

function rowsToCsv(rows) {
  const columns = [
    "templatePath",
    "sourceFormat",
    "extractedFrom",
    "locationType",
    "sheetOrPart",
    "address",
    "colorKind",
    "colorRaw",
    "colorName",
    "valueText",
    "labelText",
    "contextText",
    "requirement",
    "suggestedFieldPath",
    "suggestedFieldLabel",
    "dbStatus",
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

function summaryMarkdown(rows, unsupported, errors) {
  const lines = [];
  lines.push("# 色分け転記箇所 抽出結果");
  lines.push("");
  lines.push(`抽出行数: ${rows.length}`);
  lines.push(`未対応/要変換ファイル: ${unsupported.length}`);
  lines.push(`抽出エラー: ${errors.length}`);
  lines.push("");

  lines.push("## 入力項目候補");
  lines.push("");
  lines.push("| 入力項目 | 既存DBフィールド候補 | 表示名 | 件数 |");
  lines.push("| --- | --- | --- | ---: |");
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.requirement || "要確認"}|${row.suggestedFieldPath || "未推定"}|${
      row.suggestedFieldLabel || ""
    }`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  for (const [key, count] of Array.from(grouped.entries()).sort((a, b) => b[1] - a[1])) {
    const [requirement, fieldPath, fieldLabel] = key.split("|");
    lines.push(`| ${requirement} | \`${fieldPath}\` | ${fieldLabel} | ${count} |`);
  }

  lines.push("");
  lines.push("## 色別件数");
  lines.push("");
  lines.push("| 色 | 件数 |");
  lines.push("| --- | ---: |");
  for (const [color, count] of summarize(rows, "colorName")) {
    lines.push(`| ${color} | ${count} |`);
  }

  lines.push("");
  lines.push("## DB反映判断");
  lines.push("");
  lines.push("| 状態 | 件数 |");
  lines.push("| --- | ---: |");
  for (const [status, count] of summarize(rows, "dbStatus")) {
    lines.push(`| ${status} | ${count} |`);
  }

  const reviewRows = rows.filter((row) => row.dbStatus !== "existing").slice(0, 80);
  if (reviewRows.length > 0) {
    lines.push("");
    lines.push("## 要確認サンプル");
    lines.push("");
    lines.push("| 様式 | 位置 | 色 | 周辺ラベル | 値 | 推定 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const row of reviewRows) {
      lines.push(
        `| ${row.templatePath} | ${row.sheetOrPart} ${row.address} | ${row.colorName || row.colorRaw} | ${row.labelText || ""} | ${row.valueText || ""} | ${
          row.requirement || "要確認"
        } |`,
      );
    }
  }

  if (unsupported.length > 0) {
    lines.push("");
    lines.push("## 未対応/要変換ファイル");
    lines.push("");
    lines.push("| ファイル | 理由 |");
    lines.push("| --- | --- |");
    for (const item of unsupported.slice(0, 120)) {
      lines.push(`| ${item.templatePath} | ${item.reason} |`);
    }
  }

  if (errors.length > 0) {
    lines.push("");
    lines.push("## 抽出エラー");
    lines.push("");
    lines.push("| ファイル | 理由 |");
    lines.push("| --- | --- |");
    for (const item of errors.slice(0, 120)) {
      lines.push(`| ${item.templatePath} | ${item.reason} |`);
    }
  }

  lines.push("");
  lines.push("## 注意");
  lines.push("");
  lines.push("- 既存DBフィールド候補は、色と周辺ラベルからの機械推定です。最終マッピング前に目視確認してください。");
  lines.push("- `.doc` は `textutil` で一時 `.docx` 変換して抽出します。元ファイルは変更しません。");
  lines.push("- `.xls` は現時点では自動抽出対象外です。Excelで `.xlsx` に変換後、再実行してください。");

  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  const sourceRoot = path.resolve(projectRoot, options.sourceDir);
  const outDir = path.resolve(projectRoot, options.outDir);
  const convertedRoot = path.join(outDir, "converted-docx");
  const rows = [];
  const unsupported = [];
  const errors = [];
  const files = await collectFiles(sourceRoot);

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const templatePath = path.relative(sourceRoot, filePath).split(path.sep).join("/");

    try {
      if (ext === ".docx") {
        rows.push(...scanDocx({ sourceRoot, filePath, options }));
      } else if (ext === ".xlsx") {
        rows.push(...(await scanXlsx({ sourceRoot, filePath, options })));
      } else if (ext === ".doc") {
        if (!options.convertDoc) {
          unsupported.push({ templatePath, reason: ".doc conversion disabled" });
          continue;
        }
        const convertedPath = await convertDocToDocx(filePath, convertedRoot);
        rows.push(...scanDocx({ sourceRoot, filePath: convertedPath, convertedFrom: filePath, options }));
      } else if (ext === ".xls") {
        unsupported.push({ templatePath, reason: ".xls must be converted to .xlsx" });
      } else {
        unsupported.push({ templatePath, reason: `unsupported extension: ${ext || "(none)"}` });
      }
    } catch (error) {
      errors.push({
        templatePath,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "colored-template-fields.csv"), `${rowsToCsv(rows)}\n`, "utf8");
  await fs.writeFile(path.join(outDir, "colored-template-fields.json"), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outDir, "unsupported-files.json"), `${JSON.stringify(unsupported, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outDir, "extraction-errors.json"), `${JSON.stringify(errors, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outDir, "field-requirements-summary.md"), summaryMarkdown(rows, unsupported, errors), "utf8");

  console.log(`${files.length}件のファイルを確認しました。`);
  console.log(`${rows.length}件の色付き転記候補を抽出しました。`);
  console.log(`CSV:  ${path.relative(projectRoot, path.join(outDir, "colored-template-fields.csv"))}`);
  console.log(`JSON: ${path.relative(projectRoot, path.join(outDir, "colored-template-fields.json"))}`);
  console.log(`MD:   ${path.relative(projectRoot, path.join(outDir, "field-requirements-summary.md"))}`);
  if (unsupported.length > 0) console.log(`未対応/要変換: ${unsupported.length}件`);
  if (errors.length > 0) console.log(`抽出エラー: ${errors.length}件`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
