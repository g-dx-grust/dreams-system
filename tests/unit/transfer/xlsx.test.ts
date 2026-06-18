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

function buildTransferContext(
  overrides: Partial<TransferContext> = {},
): TransferContext {
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
    const mappings: Mapping[] = [
      { placeholder: "B2", fieldPath: "applicant.name" },
    ];

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
});
