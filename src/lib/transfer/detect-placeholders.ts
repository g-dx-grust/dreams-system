// see: docs/phase3/08_template_management.md §プレースホルダー自動検出（DOCX）
import PizZip from "pizzip";

const PLACEHOLDER_RE = /\{([^{}#/^][^{}]*)\}/g;

const TARGET_XML_RE = /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/;

function partRank(fileName: string): number {
  if (fileName === "word/document.xml") return 0;
  if (fileName.startsWith("word/header")) return 1;
  if (fileName.startsWith("word/footer")) return 2;
  return 3;
}

// 本文・ヘッダー・フッター・脚注・文末脚注のうち、実在する XML パートを列挙する。
export function listDocxTextPartNames(zip: PizZip): string[] {
  return Object.keys(zip.files)
    .filter((fileName) => {
      const file = zip.files[fileName];
      return Boolean(file) && !file?.dir && TARGET_XML_RE.test(fileName);
    })
    .sort((a, b) => partRank(a) - partRank(b) || a.localeCompare(b));
}

// docxtemplater の解釈単位に合わせて段落ごとにテキストを連結する。
// 文書全体を 1 本の文字列にすると、離れた段落の { と } が誤マッチするため。
export function extractDocxParagraphTexts(xml: string): string[] {
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
  const chunks = paragraphs.length > 0 ? paragraphs : [xml];
  return chunks.map((chunk) => chunk.replace(/<[^>]+>/g, ""));
}

export function detectPlaceholdersInDocx(buffer: ArrayBuffer): string[] {
  const zip = new PizZip(buffer);
  const found = new Set<string>();
  for (const path of listDocxTextPartNames(zip)) {
    const xml = zip.file(path)?.asText();
    if (!xml) continue;
    for (const paragraphText of extractDocxParagraphTexts(xml)) {
      for (const m of paragraphText.matchAll(PLACEHOLDER_RE)) {
        const key = m[1]?.trim();
        if (key) found.add(key);
      }
    }
  }
  return Array.from(found).sort();
}
