// see: docs/phase3/07_transfer_engine.md §Word 転記（docxtemplater）
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import type { TransferContext } from "@/types/transfer";
import { canonicalizeFieldPath, normalizeFieldLookup } from "./field-dict";
import { resolveRawPath, type Mapping } from "./engine";

type ParserContext = {
  num: number;
  scopeList: unknown[];
};

// docxtemplater が投げるタグ不整合エラーを日本語で伝えるための例外。
// generateDocument 側で捕捉して Result の fail に変換する。
export class TransferTagError extends Error {}

type DocxTemplaterErrorProperties = {
  id?: string;
  explanation?: string;
  context?: string;
  xtag?: string;
  file?: string;
  errors?: unknown[];
};

const DOCX_TAG_ERROR_LABELS: Record<string, string> = {
  unclosed_tag: "閉じ } がないタグ",
  unopened_tag: "開き { がないタグ",
  duplicate_open_tag: "{ が重複しているタグ",
  duplicate_close_tag: "} が重複しているタグ",
  unclosed_loop: "閉じられていないループタグ",
  unopened_loop: "開始タグのないループタグ",
  closing_tag_does_not_match_opening_tag: "開始と終了が一致しないループタグ",
};

function docxErrorProperties(error: unknown): DocxTemplaterErrorProperties | null {
  if (!error || typeof error !== "object") return null;
  const properties = (error as { properties?: unknown }).properties;
  if (!properties || typeof properties !== "object") return null;
  return properties as DocxTemplaterErrorProperties;
}

function collectDocxTagIssues(error: unknown): string[] {
  const properties = docxErrorProperties(error);
  if (!properties) return [];

  const nested = Array.isArray(properties.errors) ? properties.errors : [];
  if (nested.length > 0) {
    return nested.flatMap((child) => collectDocxTagIssues(child));
  }
  if (!properties.id) return [];

  const label = DOCX_TAG_ERROR_LABELS[properties.id] ?? "処理できないタグ";
  const tag = (properties.xtag || properties.context || "").trim();
  return [tag ? `${label}「${tag}」` : label];
}

export function formatDocxTagError(error: unknown): string | null {
  const issues = Array.from(new Set(collectDocxTagIssues(error)));
  if (issues.length === 0) return null;
  return `差し込みタグに問題があります: ${issues.join("、")}`;
}

const DOCX_PACKAGE_ORDER = [
  "[Content_Types].xml",
  "_rels/.rels",
  "docProps/core.xml",
  "docProps/app.xml",
  "docProps/meta.xml",
  "word/_rels/document.xml.rels",
  "word/document.xml",
];

function buildMappingLookup(mappings: Mapping[]): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const mapping of mappings) {
    const placeholder = normalizeDocxTag(mapping.placeholder);
    const fieldPath = canonicalizeFieldPath(mapping.fieldPath);
    if (!placeholder || !fieldPath) continue;

    lookup.set(placeholder, fieldPath);
    lookup.set(placeholder.toLowerCase(), fieldPath);
  }

  return lookup;
}

function normalizeDocxTag(tag: string): string {
  return normalizeFieldLookup(tag);
}

function resolveFromScopeList(
  currentScope: unknown,
  context: ParserContext,
  path: string,
  preferRoot: boolean,
): unknown {
  if (path === "." || path === "this") return currentScope;
  if (path.startsWith("this.") || path.startsWith(".")) return resolveRawPath(currentScope, path);

  const scopes = context.scopeList ?? [];
  const rootScope = scopes[0] ?? currentScope;

  if (preferRoot) {
    const fromRoot = resolveRawPath(rootScope, path);
    if (fromRoot !== undefined) return fromRoot;
  }

  const fromCurrent = resolveRawPath(currentScope, path);
  if (fromCurrent !== undefined) return fromCurrent;

  if (!preferRoot) {
    return undefined;
  }

  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const fromScope = resolveRawPath(scopes[index], path);
    if (fromScope !== undefined) return fromScope;
  }

  return undefined;
}

function createTransferParser(mappingLookup: Map<string, string>) {
  return (tag: string) => {
    const normalizedTag = tag.trim();
    const lookupTag = normalizeDocxTag(normalizedTag);
    const mappedPath =
      mappingLookup.get(lookupTag) ?? mappingLookup.get(lookupTag.toLowerCase()) ?? null;

    return {
      get(scope: unknown, context: ParserContext): unknown {
        if (!normalizedTag) return undefined;

        return resolveFromScopeList(
          scope,
          context,
          mappedPath ?? normalizedTag,
          Boolean(mappedPath),
        );
      },
    };
  };
}

function normalizeTextutilWordXml(xml: string) {
  return xml.replace(/\bw:sz-cs\b/g, "w:szCs").replace(/\bw:first-line\b/g, "w:firstLine");
}

const LEGACY_EQ_OVERLAY_PATTERN = /eq\s*\\o\\ac\(○,\s*([0-9０-９]+|印)\s*\)/gu;

function normalizeLegacyEqOverlayText(paragraphXml: string) {
  const textNodes = [...paragraphXml.matchAll(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/gu)].map((match) => {
    const fullMatch = match[0];
    const openEnd = fullMatch.indexOf(">");
    const closeStart = fullMatch.lastIndexOf("</w:t>");
    const innerStart = (match.index ?? 0) + openEnd + 1;
    const innerEnd = (match.index ?? 0) + closeStart;

    return {
      innerStart,
      innerEnd,
      text: paragraphXml.slice(innerStart, innerEnd),
      nextText: paragraphXml.slice(innerStart, innerEnd),
      flatStart: 0,
      flatEnd: 0,
    };
  });

  if (textNodes.length === 0) return paragraphXml;

  let flatText = "";
  for (const textNode of textNodes) {
    textNode.flatStart = flatText.length;
    flatText += textNode.text;
    textNode.flatEnd = flatText.length;
  }

  const matches = [...flatText.matchAll(LEGACY_EQ_OVERLAY_PATTERN)]
    .map((match) => {
      return {
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        replacement: "",
      };
    })
    .filter((match): match is { start: number; end: number; replacement: string } => Boolean(match))
    .reverse();

  if (matches.length === 0) return paragraphXml;

  for (const match of matches) {
    let inserted = false;

    for (const textNode of textNodes) {
      const overlapStart = Math.max(match.start, textNode.flatStart);
      const overlapEnd = Math.min(match.end, textNode.flatEnd);
      if (overlapStart >= overlapEnd) continue;

      const localStart = overlapStart - textNode.flatStart;
      const localEnd = overlapEnd - textNode.flatStart;
      const before = textNode.nextText.slice(0, localStart);
      const after = textNode.nextText.slice(localEnd);

      if (!inserted) {
        textNode.nextText = `${before}${match.replacement}${after}`;
        inserted = true;
      } else {
        textNode.nextText = `${before}${after}`;
      }
    }
  }

  let normalizedXml = "";
  let cursor = 0;
  for (const textNode of textNodes) {
    normalizedXml += paragraphXml.slice(cursor, textNode.innerStart);
    normalizedXml += textNode.nextText;
    cursor = textNode.innerEnd;
  }

  return normalizedXml + paragraphXml.slice(cursor);
}

function normalizeLegacyEqOverlays(xml: string) {
  if (!xml.includes("eq") || !xml.includes("\\o\\ac")) return xml;

  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/gu, (paragraphXml) =>
    normalizeLegacyEqOverlayText(paragraphXml),
  );
}

function isRoundButtonShapeRun(runXml: string): boolean {
  if (runXml.includes("<w:drawing") && /<a:prstGeom\b[^>]*\bprst="ellipse"/u.test(runXml)) {
    return true;
  }

  return (
    runXml.includes("<w:pict") &&
    /<(?:v:oval|v:shape)\b/iu.test(runXml) &&
    /(?:oval|ellipse|○|_x0000_t75)/iu.test(runXml)
  );
}

// 図形 run はテキストボックス経由で <w:r> が入れ子になり得るため、
// 非貪欲マッチではなく開閉タグの深さを数えて run 全体を取り出す。
function removeRoundButtonShapeRuns(xml: string) {
  const runTagRe = /<w:r\b[^>]*\/>|<w:r\b[^>]*>|<\/w:r>/gu;
  let result = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = runTagRe.exec(xml))) {
    const token = match[0];
    if (token.endsWith("/>") || token.startsWith("</")) continue;

    const start = match.index;
    let depth = 1;
    let end = -1;
    let inner: RegExpExecArray | null;
    while (depth > 0 && (inner = runTagRe.exec(xml))) {
      if (inner[0].endsWith("/>")) continue;
      depth += inner[0].startsWith("</") ? -1 : 1;
      if (depth === 0) end = inner.index + inner[0].length;
    }
    if (end === -1) break;

    if (isRoundButtonShapeRun(xml.slice(start, end))) {
      result += xml.slice(cursor, start);
      cursor = end;
    }
    runTagRe.lastIndex = end;
  }

  return result + xml.slice(cursor);
}

function normalizeWordXmlParts(zip: PizZip) {
  for (const fileName of Object.keys(zip.files)) {
    const file = zip.files[fileName];
    if (!file || file.dir || !/^word\/.+\.xml$/u.test(fileName)) continue;

    const xml = file.asText();
    const normalized = normalizeLegacyEqOverlays(
      removeRoundButtonShapeRuns(normalizeTextutilWordXml(xml)),
    );
    if (normalized !== xml) {
      zip.file(fileName, normalized);
    }
  }
}

function generateDocxPackage(zip: PizZip): Buffer {
  const output = new PizZip();
  const fileNames = Object.keys(zip.files).filter((fileName) => !zip.files[fileName]?.dir);
  const orderedFileNames = [
    ...DOCX_PACKAGE_ORDER.filter((fileName) => fileNames.includes(fileName)),
    ...fileNames
      .filter((fileName) => !DOCX_PACKAGE_ORDER.includes(fileName))
      .sort((a, b) => a.localeCompare(b)),
  ];

  for (const fileName of orderedFileNames) {
    const file = zip.files[fileName];
    if (!file || file.dir) continue;
    output.file(fileName, file.asNodeBuffer());
  }

  return output.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

function normalizeDocxRenderValue(value: unknown): unknown {
  if (typeof value === "string") {
    // 改行は行送りを崩さないよう単一行化するが、前後の語が連結しないよう半角スペースへ置換する。
    // see: docs/phase3/07_transfer_engine.md §旧Word変換テンプレートの正規化
    return value.replace(/\r\n?/g, "\n").replace(/\n+/g, " ");
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeDocxRenderValue(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        normalizeDocxRenderValue(child),
      ]),
    );
  }

  return value;
}

export function fillDocx(
  templateBuffer: ArrayBuffer,
  context: TransferContext,
  highlight: boolean,
  mappings: Mapping[] = [],
): Buffer {
  void highlight; // ハイライトはテンプレート側 Run 属性で対応（3-A 方式）
  const zip = new PizZip(templateBuffer);
  normalizeWordXmlParts(zip);
  const mappingLookup = buildMappingLookup(mappings);
  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: false,
      delimiters: { start: "{", end: "}" },
      nullGetter: () => "",
      parser: createTransferParser(mappingLookup),
    });
    doc.render(normalizeDocxRenderValue(context) as Record<string, unknown>);
  } catch (error) {
    const message = formatDocxTagError(error);
    if (message) throw new TransferTagError(message);
    throw error;
  }
  normalizeWordXmlParts(doc.getZip());
  return generateDocxPackage(doc.getZip());
}
