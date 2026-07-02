import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { fillXlsx } from "@/lib/transfer/xlsx";
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

async function createWorkbookBuffer(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("帳票");
  sheet.getCell("B2").value = "placeholder";
  sheet.getCell("C3").value = "placeholder";
  sheet.getCell("D4").value = "placeholder";
  workbook.definedNames.add("帳票!$E$5", "transferee_name");

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

async function loadWorkbook(buffer: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Buffer.from(buffer) as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0],
  );
  return workbook;
}

describe("fillXlsx", () => {
  it("セル座標と名前定義にネスト項目を転記できる", async () => {
    const template = await createWorkbookBuffer();
    const context = buildTransferContext({
      applicant: {
        ...EMPTY_PERSON,
        addressFull: "愛知県豊橋市大岩町字大穴1-1",
      },
      transferee: {
        ...EMPTY_PERSON,
        name: "株式会社ドリームズ",
      },
      parcel: {
        ...EMPTY_PARCEL,
        area: "1,234.56",
      },
    });
    const mappings: Mapping[] = [
      { placeholder: "B2", fieldPath: "applicant.address_full" },
      { placeholder: "帳票!C3", fieldPath: "transferee.name" },
      { placeholder: "D4", fieldPath: "parcel.area" },
      { placeholder: "transferee_name", fieldPath: "transferee.name" },
    ];

    const output = await fillXlsx(template, context, mappings, true);
    const workbook = await loadWorkbook(output);
    const sheet = workbook.getWorksheet("帳票");

    expect(sheet?.getCell("B2").value).toBe("愛知県豊橋市大岩町字大穴1-1");
    expect(sheet?.getCell("C3").value).toBe("株式会社ドリームズ");
    expect(sheet?.getCell("D4").value).toBe(1234.56);
    expect(sheet?.getCell("E5").value).toBe("株式会社ドリームズ");
    expect(sheet?.getCell("B2").fill).toEqual({
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF00" },
    });
  });

  it("空文字の値はセルを書き換えない", async () => {
    const template = await createWorkbookBuffer();
    const context = buildTransferContext();
    const mappings: Mapping[] = [{ placeholder: "B2", fieldPath: "applicant.name" }];

    const output = await fillXlsx(template, context, mappings, false);
    const workbook = await loadWorkbook(output);

    expect(workbook.getWorksheet("帳票")?.getCell("B2").value).toBe("placeholder");
  });

  it("セル内のプレースホルダーだけを置換できる", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("帳票");
    sheet.getCell("A1").value = "作成日: {todayYear}{todayMonth}月{todayDay}日";
    const template = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
    const context = buildTransferContext();
    const mappings: Mapping[] = [
      { placeholder: "A1", fieldPath: "todayYear" },
      { placeholder: "A1", fieldPath: "todayMonth" },
      { placeholder: "A1", fieldPath: "todayDay" },
    ];

    const output = await fillXlsx(template, context, mappings, false);
    const rendered = await loadWorkbook(output);

    expect(rendered.getWorksheet("帳票")?.getCell("A1").value).toBe("作成日: 令和8年4月24日");
  });

  it("空値でもセル内の埋め込みトークンは除去される", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("帳票");
    sheet.getCell("A1").value = "氏名:{applicant.name}";
    sheet.getCell("B2").value = "placeholder";
    const template = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
    const context = buildTransferContext();
    const mappings: Mapping[] = [
      { placeholder: "A1", fieldPath: "applicant.name" },
      { placeholder: "B2", fieldPath: "applicant.name" },
    ];

    const output = await fillXlsx(template, context, mappings, false);
    const rendered = await loadWorkbook(output);
    const renderedSheet = rendered.getWorksheet("帳票");

    expect(renderedSheet?.getCell("A1").value).toBe("氏名:");
    expect(renderedSheet?.getCell("B2").value).toBe("placeholder");
  });

  it("結合セルの非アンカー座標へのマッピングでもアンカーに転記する", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("帳票");
    sheet.mergeCells("A1:C1");
    const template = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
    const context = buildTransferContext({
      applicant: { ...EMPTY_PERSON, name: "田中太郎" },
    });
    const mappings: Mapping[] = [{ placeholder: "B1", fieldPath: "applicant.name" }];

    const output = await fillXlsx(template, context, mappings, true);
    const rendered = await loadWorkbook(output);
    const renderedSheet = rendered.getWorksheet("帳票");

    expect(renderedSheet?.getCell("A1").value).toBe("田中太郎");
    expect(renderedSheet?.getCell("A1").fill).toEqual({
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF00" },
    });
  });

  it("結合を含むループ行を複製しても各行の結合が保たれる", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("帳票");
    sheet.mergeCells("A5:B5");
    sheet.getCell("A5").value = "{parcel.chiban}";
    sheet.getCell("C5").value = "{parcel.area}";
    sheet.getCell("A6").value = "footer";
    workbook.definedNames.add("帳票!$A$5", "loop_parcels_start");
    workbook.definedNames.add("帳票!$A$5", "loop_parcels_end");
    const template = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
    const context = buildTransferContext({
      parcels: [
        { ...EMPTY_PARCEL, chiban: "1-1", area: "120.5" },
        { ...EMPTY_PARCEL, chiban: "2-1", area: "80" },
      ],
    });

    const output = await fillXlsx(template, context, [], false);
    const rendered = await loadWorkbook(output);
    const renderedSheet = rendered.getWorksheet("帳票");

    expect(renderedSheet?.getCell("A5").value).toBe("1-1");
    expect(renderedSheet?.getCell("B5").isMerged).toBe(true);
    expect(renderedSheet?.getCell("A6").value).toBe("2-1");
    expect(renderedSheet?.getCell("B6").isMerged).toBe(true);
    expect(renderedSheet?.getCell("B6").master.address).toBe("A6");
    expect(renderedSheet?.getCell("A7").value).toBe("footer");
  });

  it("loop_parcels_start/endの行を筆数分だけ複製できる", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("帳票");
    sheet.getCell("A5").value = "{parcel.chiban}";
    sheet.getCell("B5").value = "{parcel.area}";
    sheet.getCell("C5").value = "{caseNumber}";
    sheet.getCell("A6").value = "footer";
    sheet.getCell("A5").font = { bold: true };
    workbook.definedNames.add("帳票!$A$5", "loop_parcels_start");
    workbook.definedNames.add("帳票!$A$5", "loop_parcels_end");
    const template = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
    const context = buildTransferContext({
      parcels: [
        { ...EMPTY_PARCEL, chiban: "1-1", area: "120.5" },
        { ...EMPTY_PARCEL, chiban: "2-1", area: "80" },
      ],
    });

    const output = await fillXlsx(template, context, [], false);
    const rendered = await loadWorkbook(output);
    const renderedSheet = rendered.getWorksheet("帳票");

    expect(renderedSheet?.getCell("A5").value).toBe("1-1");
    expect(renderedSheet?.getCell("B5").value).toBe(120.5);
    expect(renderedSheet?.getCell("C5").value).toBe("2026-FC-001");
    expect(renderedSheet?.getCell("A5").font).toMatchObject({ bold: true });
    expect(renderedSheet?.getCell("A6").value).toBe("2-1");
    expect(renderedSheet?.getCell("B6").value).toBe(80);
    expect(renderedSheet?.getCell("A7").value).toBe("footer");
  });

  it("法人番号・地番・郵便番号は文字列のまま、金額・面積は数値で転記する", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("帳票");
    for (const ref of ["A1", "A2", "A3", "A4", "A5"]) {
      sheet.getCell(ref).value = "placeholder";
    }
    const template = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
    const context = buildTransferContext({
      applicant: { ...EMPTY_PERSON, corporateNumber: "1234567890123", zip: "0012345" },
      parcel: { ...EMPTY_PARCEL, chiban: "100", area: "123.45" },
      estimateAmountTotal: "110,000",
    });
    const mappings: Mapping[] = [
      { placeholder: "A1", fieldPath: "applicant.corporateNumber" },
      { placeholder: "A2", fieldPath: "parcel.chiban" },
      { placeholder: "A3", fieldPath: "applicant.zip" },
      { placeholder: "A4", fieldPath: "parcel.area" },
      { placeholder: "A5", fieldPath: "estimateAmountTotal" },
    ];

    const output = await fillXlsx(template, context, mappings, false);
    const rendered = await loadWorkbook(output);
    const renderedSheet = rendered.getWorksheet("帳票");

    expect(renderedSheet?.getCell("A1").value).toBe("1234567890123");
    expect(renderedSheet?.getCell("A2").value).toBe("100");
    expect(renderedSheet?.getCell("A3").value).toBe("0012345");
    expect(renderedSheet?.getCell("A4").value).toBe(123.45);
    expect(renderedSheet?.getCell("A5").value).toBe(110000);
  });

  it("ループ行でも地番は文字列のまま、面積は数値で転記する", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("帳票");
    sheet.getCell("A5").value = "{parcel.chiban}";
    sheet.getCell("B5").value = "{parcel.area}";
    workbook.definedNames.add("帳票!$A$5", "loop_parcels_start");
    workbook.definedNames.add("帳票!$A$5", "loop_parcels_end");
    const template = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
    const context = buildTransferContext({
      parcels: [{ ...EMPTY_PARCEL, chiban: "100", area: "120.5" }],
    });

    const output = await fillXlsx(template, context, [], false);
    const rendered = await loadWorkbook(output);
    const renderedSheet = rendered.getWorksheet("帳票");

    expect(renderedSheet?.getCell("A5").value).toBe("100");
    expect(renderedSheet?.getCell("B5").value).toBe(120.5);
  });

  it("loop_parcels_start/endの行は筆が0件なら削除する", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("帳票");
    sheet.getCell("A5").value = "{parcel.chiban}";
    sheet.getCell("A6").value = "footer";
    workbook.definedNames.add("帳票!$A$5", "loop_parcels_start");
    workbook.definedNames.add("帳票!$A$5", "loop_parcels_end");
    const template = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;

    const output = await fillXlsx(template, buildTransferContext({ parcels: [] }), [], false);
    const rendered = await loadWorkbook(output);

    expect(rendered.getWorksheet("帳票")?.getCell("A5").value).toBe("footer");
  });
});
