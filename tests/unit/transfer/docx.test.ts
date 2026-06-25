import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { fillDocx } from "@/lib/transfer/docx";
import type { Mapping } from "@/lib/transfer/engine";
import type { ParcelContext, PersonContext, TransferContext } from "@/types/transfer";

const EMPTY_PERSON: PersonContext = {
  name: "",
  nameKana: "",
  zip: "",
  addressPref: "",
  addressCity: "",
  addressTown: "",
  addressLine1: "",
  addressLine2: "",
  addressFull: "",
  addressNoPref: "",
  phone: "",
  fax: "",
  email: "",
  corporateNumber: "",
  representativeName: "",
};

const EMPTY_PARCEL: ParcelContext = {
  pref: "",
  city: "",
  oaza: "",
  aza: "",
  oazaAza: "",
  chiban: "",
  locationFull: "",
  chimoku: "",
  area: "",
  tenyoArea: "",
};

function buildTransferContext(overrides: Partial<TransferContext> = {}): TransferContext {
  return {
    caseNumber: "2026-FC-001",
    caseName: "農地転用",
    caseMemo: "転用目的",
    caseTypeLabel: "5条許可",
    submissionTarget: "豊橋市",
    submissionDate: "",
    deadlineDate: "",
    today: "令和8年4月24日",
    todayYear: "令和8年",
    todayMonth: "4",
    todayDay: "24",
    applicant: EMPTY_PERSON,
    transferee: EMPTY_PERSON,
    transferor: EMPTY_PERSON,
    agent: EMPTY_PERSON,
    billing: EMPTY_PERSON,
    neighbor: EMPTY_PERSON,
    applicants: [],
    neighbors: [],
    parcels: [],
    parcel: EMPTY_PARCEL,
    totalArea: "",
    totalTenyoArea: "",
    estimateAmount: "",
    estimateAmountTax: "",
    estimateAmountTotal: "",
    invoiceAmount: "",
    invoiceAmountTax: "",
    invoiceAmountTotal: "",
    ...overrides,
  };
}

function escapeXmlText(input: string): string {
  return input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function createDocxTemplate(text: string): ArrayBuffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t xml:space="preserve">${escapeXmlText(text)}</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`,
  );

  return zip.generate({ type: "arraybuffer", compression: "DEFLATE" }) as ArrayBuffer;
}

function extractDocumentText(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  const xml = zip.file("word/document.xml")?.asText() ?? "";

  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDocumentXml(buffer: Buffer): string {
  return new PizZip(buffer).file("word/document.xml")?.asText() ?? "";
}

describe("fillDocx", () => {
  it("ネストしたプレースホルダーと snake_case エイリアスを転記できる", () => {
    const template = createDocxTemplate(
      "譲受人:{transferee.name} 住所:{transferee.address_full} 所在:{parcel.locationFull}",
    );
    const context = buildTransferContext({
      transferee: {
        ...EMPTY_PERSON,
        name: "株式会社ドリームズ",
        addressFull: "愛知県豊橋市駅前大通1-1",
      },
      parcel: {
        ...EMPTY_PARCEL,
        locationFull: "豊橋市大岩町字大穴1-1",
      },
    });

    const rendered = fillDocx(template, context, false);
    const text = extractDocumentText(rendered);

    expect(text).toContain("譲受人:株式会社ドリームズ");
    expect(text).toContain("住所:愛知県豊橋市駅前大通1-1");
    expect(text).toContain("所在:豊橋市大岩町字大穴1-1");
  });

  it("DBマッピングで任意の差し込み名をフィールドパスへ転記できる", () => {
    const template = createDocxTemplate("申請者:{申請者氏名} 住所:{申請者住所}");
    const context = buildTransferContext({
      applicant: {
        ...EMPTY_PERSON,
        name: "田中太郎",
        addressFull: "愛知県豊橋市大岩町字大穴1-1",
      },
    });
    const mappings: Mapping[] = [
      { placeholder: "申請者氏名", fieldPath: "applicant.name" },
      { placeholder: "申請者住所", fieldPath: "applicant.address_full" },
    ];

    const rendered = fillDocx(template, context, false, mappings);
    const text = extractDocumentText(rendered);

    expect(text).toContain("申請者:田中太郎");
    expect(text).toContain("住所:愛知県豊橋市大岩町字大穴1-1");
  });

  it("ループ内でも親スコープの値を引き継げる", () => {
    const template = createDocxTemplate("申請者:{#applicants}{name}-{caseNumber};{/applicants}");
    const context = buildTransferContext({
      applicants: [
        { ...EMPTY_PERSON, name: "田中太郎" },
        { ...EMPTY_PERSON, name: "佐藤花子" },
      ],
    });

    const rendered = fillDocx(template, context, false);
    const text = extractDocumentText(rendered);

    expect(text).toContain("申請者:田中太郎-2026-FC-001;佐藤花子-2026-FC-001;");
  });

  it("旧Word変換由来の非標準OOXML名を生成時に補正する", () => {
    const zip = new PizZip(createDocxTemplate("{today}"));
    zip.file(
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:ind w:first-line="720"/></w:pPr>
      <w:r><w:rPr><w:sz-cs w:val="21"/></w:rPr><w:t>{today}</w:t></w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`,
    );

    const rendered = fillDocx(
      zip.generate({ type: "arraybuffer", compression: "DEFLATE" }) as ArrayBuffer,
      buildTransferContext(),
      false,
    );
    const outputZip = new PizZip(rendered);
    const xml = extractDocumentXml(rendered);

    expect(xml).toContain("令和8年4月24日");
    expect(xml).toContain('<w:szCs w:val="21"/>');
    expect(xml).toContain('w:firstLine="720"');
    expect(xml).not.toContain("w:sz-cs");
    expect(xml).not.toContain("w:first-line");
    expect(Object.keys(outputZip.files)[0]).toBe("[Content_Types].xml");
    expect(Object.values(outputZip.files).some((file) => file.dir)).toBe(false);
  });

  it("旧Word変換由来のEQ丸数字と丸印を生成時に空欄化する", () => {
    const zip = new PizZip(createDocxTemplate("{today}"));
    zip.file(
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t xml:space="preserve">　　　eq \\o\\ac(○,</w:t></w:r>
      <w:r><w:rPr><w:position w:val="3"/></w:rPr><w:t>1</w:t></w:r>
      <w:r><w:t>)案内図</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t xml:space="preserve">氏名 {applicant.name} eq \\o\\ac(○,</w:t></w:r>
      <w:r><w:rPr><w:position w:val="3"/></w:rPr><w:t>印</w:t></w:r>
      <w:r><w:t>)</w:t></w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`,
    );

    const rendered = fillDocx(
      zip.generate({ type: "arraybuffer", compression: "DEFLATE" }) as ArrayBuffer,
      buildTransferContext({ applicant: { ...EMPTY_PERSON, name: "田中太郎" } }),
      false,
    );
    const xml = extractDocumentXml(rendered);
    const text = extractDocumentText(rendered);

    expect(xml).not.toContain("①");
    expect(xml).not.toContain("㊞");
    expect(text).toContain("案内図");
    expect(text).toContain("氏名 田中太郎");
    expect(xml).not.toContain("eq \\o\\ac");
  });

  it("複数のEQ丸数字がある旧Wordテンプレートでも露出させない", () => {
    const zip = new PizZip(createDocxTemplate("{today}"));
    zip.file(
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${[1, 2, 3, 4, 5, 6]
      .map(
        (number) => `<w:p>
      <w:r><w:t xml:space="preserve">　　　eq \\o\\ac(○,</w:t></w:r>
      <w:r><w:rPr><w:position w:val="3"/></w:rPr><w:t>${number}</w:t></w:r>
      <w:r><w:t>)資料${number}</w:t></w:r>
    </w:p>`,
      )
      .join("\n")}
    <w:sectPr/>
  </w:body>
</w:document>`,
    );

    const rendered = fillDocx(
      zip.generate({ type: "arraybuffer", compression: "DEFLATE" }) as ArrayBuffer,
      buildTransferContext(),
      false,
    );
    const xml = extractDocumentXml(rendered);
    const text = extractDocumentText(rendered);

    expect(text).toContain("資料1");
    expect(text).toContain("資料2");
    expect(text).toContain("資料3");
    expect(text).toContain("資料4");
    expect(text).toContain("資料5");
    expect(text).toContain("資料6");
    expect(text).not.toContain("①");
    expect(text).not.toContain("②");
    expect(text).not.toContain("③");
    expect(text).not.toContain("④");
    expect(text).not.toContain("⑤");
    expect(text).not.toContain("⑥");
    expect(xml).not.toContain("eq \\o\\ac");
  });
});
