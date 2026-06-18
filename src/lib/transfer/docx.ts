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

function normalizeWordXmlParts(zip: PizZip) {
  for (const fileName of Object.keys(zip.files)) {
    const file = zip.files[fileName];
    if (!file || file.dir || !/^word\/.+\.xml$/u.test(fileName)) continue;

    const xml = file.asText();
    const normalized = normalizeTextutilWordXml(xml);
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
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
    nullGetter: () => "",
    parser: createTransferParser(mappingLookup),
  });
  doc.render(context as Record<string, unknown>);
  normalizeWordXmlParts(doc.getZip());
  return generateDocxPackage(doc.getZip());
}
