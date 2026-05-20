// see: docs/phase3/08_template_management.md §プレースホルダー自動検出（DOCX）
import PizZip from "pizzip";

const PLACEHOLDER_RE = /\{([^{}#/^][^{}]*)\}/g;

const TARGET_XMLS = [
  "word/document.xml",
  "word/header1.xml",
  "word/header2.xml",
  "word/header3.xml",
  "word/footer1.xml",
  "word/footer2.xml",
  "word/footer3.xml",
];

export function detectPlaceholdersInDocx(buffer: ArrayBuffer): string[] {
  const zip = new PizZip(buffer);
  const found = new Set<string>();
  for (const path of TARGET_XMLS) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = file.asText();
    const plain = xml.replace(/<[^>]+>/g, "");
    for (const m of plain.matchAll(PLACEHOLDER_RE)) {
      const key = m[1]?.trim();
      if (key) found.add(key);
    }
  }
  return Array.from(found).sort();
}
