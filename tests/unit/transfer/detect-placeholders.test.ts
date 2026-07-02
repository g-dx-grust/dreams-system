import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { detectPlaceholdersInDocx } from "@/lib/transfer/detect-placeholders";

function wordXml(bodyXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}<w:sectPr/></w:body>
</w:document>`;
}

function paragraph(...runTexts: string[]): string {
  const runs = runTexts
    .map((text) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`)
    .join("");
  return `<w:p>${runs}</w:p>`;
}

function createDocx(parts: Record<string, string>): ArrayBuffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`,
  );
  for (const [path, xml] of Object.entries(parts)) {
    zip.file(path, xml);
  }
  return zip.generate({ type: "arraybuffer", compression: "DEFLATE" }) as ArrayBuffer;
}

describe("detectPlaceholdersInDocx", () => {
  it("分割された run をまたぐプレースホルダーを段落単位で検出する", () => {
    const buffer = createDocx({
      "word/document.xml": wordXml(paragraph("氏名:{applicant.", "name}")),
    });

    expect(detectPlaceholdersInDocx(buffer)).toEqual(["applicant.name"]);
  });

  it("段落をまたぐ { と } を誤検出しない", () => {
    const buffer = createDocx({
      "word/document.xml": wordXml(
        [
          paragraph("注記: 該当する場合は { に丸を付ける"),
          paragraph("記入欄の } は消さないでください"),
          paragraph("提出者:{applicant.name}"),
        ].join(""),
      ),
    });

    expect(detectPlaceholdersInDocx(buffer)).toEqual(["applicant.name"]);
  });

  it("header4・footnotes・endnotes のプレースホルダーも検出する", () => {
    const buffer = createDocx({
      "word/document.xml": wordXml(paragraph("{caseNumber}")),
      "word/header4.xml": wordXml(paragraph("{submissionTarget}")),
      "word/footer5.xml": wordXml(paragraph("{today}")),
      "word/footnotes.xml": wordXml(paragraph("{applicant.zip}")),
      "word/endnotes.xml": wordXml(paragraph("{agent.name}")),
    });

    expect(detectPlaceholdersInDocx(buffer)).toEqual([
      "agent.name",
      "applicant.zip",
      "caseNumber",
      "submissionTarget",
      "today",
    ]);
  });

  it("ループ・セクションタグは候補から除外する", () => {
    const buffer = createDocx({
      "word/document.xml": wordXml(
        paragraph("{#applicants}{name}{/applicants}{^parcels}なし{/parcels}"),
      ),
    });

    expect(detectPlaceholdersInDocx(buffer)).toEqual(["name"]);
  });
});
