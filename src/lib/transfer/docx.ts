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

function removeRoundButtonShapeRuns(xml: string) {
  return xml.replace(/<w:r\b[\s\S]*?<\/w:r>/gu, (runXml) => {
    if (runXml.includes("<w:drawing") && /<a:prstGeom\b[^>]*\bprst="ellipse"/u.test(runXml)) {
      return "";
    }

    if (
      runXml.includes("<w:pict") &&
      /<(?:v:oval|v:shape)\b/iu.test(runXml) &&
      /(?:oval|ellipse|○|_x0000_t75)/iu.test(runXml)
    ) {
      return "";
    }

    return runXml;
  });
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
    return value.replace(/\r\n?/g, "\n").replace(/\n+/g, "");
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
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: false,
    delimiters: { start: "{", end: "}" },
    nullGetter: () => "",
    parser: createTransferParser(mappingLookup),
  });
  doc.render(normalizeDocxRenderValue(context) as Record<string, unknown>);
  normalizeWordXmlParts(doc.getZip());
  return generateDocxPackage(doc.getZip());
}
