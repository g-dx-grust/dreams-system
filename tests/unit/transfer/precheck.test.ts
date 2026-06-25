import { describe, expect, it } from "vitest";
import { formatMissingRequiredMessage, preCheck } from "@/lib/transfer/precheck";
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
    caseMemo: "",
    caseTypeLabel: "農地転用許可",
    submissionTarget: "",
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

describe("preCheck", () => {
  it("必須と任意の不足を分けて検出できる", () => {
    const mappings: Mapping[] = [
      { placeholder: "A1", fieldPath: "caseNumber", label: "案件番号", isRequired: true },
      { placeholder: "A2", fieldPath: "applicant.name", label: "申請者氏名", isRequired: true },
      { placeholder: "A3", fieldPath: "billing.name", label: "請求先", isRequired: false },
    ];

    const result = preCheck(buildTransferContext(), mappings);

    expect(result.totalFields).toBe(3);
    expect(result.filledFields).toBe(1);
    expect(result.missingRequired).toEqual(["申請者氏名"]);
    expect(result.missingOptional).toEqual(["請求先"]);
    expect(result.previewData).toMatchObject({
      caseNumber: "2026-FC-001",
      "applicant.name": "",
    });
  });

  it("必須不足メッセージは長い一覧を省略できる", () => {
    expect(formatMissingRequiredMessage(["A", "B", "C", "D", "E", "F", "A"])).toBe(
      "必須フィールド（A、B、C、D、E、ほか1件）が未入力です。案件情報・関係者・土地情報を補完してから帳票を生成してください。",
    );
  });
});
