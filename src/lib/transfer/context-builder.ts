// see: docs/phase3/07_transfer_engine.md §TransferContext の組み立て
import type { TransferContext, PersonContext, ParcelContext } from "@/types/transfer";
import type { CaseRow, CasePersonRow, CaseParcelRow, CaseFinancialRow } from "@/server/cases";
import { toWareki } from "./wareki";
import { formatZip, amountStr, taxOf, totalOf } from "./transfer-format";
import { CaseTypeLabels } from "@/lib/validators/case";

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
  aza: "",
  chiban: "",
  locationFull: "",
  chimoku: "",
  area: "",
  tenyoArea: "",
};

export function buildPersonContext(cp: CasePersonRow): PersonContext {
  const parts = [
    cp.snapshot_address_pref,
    cp.snapshot_address_city,
    cp.snapshot_address_town,
    cp.snapshot_address_line1,
    cp.snapshot_address_line2,
  ];
  const addressFull = parts.filter(Boolean).join("");
  const addressNoPref = parts.slice(1).filter(Boolean).join("");

  return {
    ...EMPTY_PERSON,
    name: cp.snapshot_name ?? "",
    nameKana: cp.snapshot_name_kana ?? "",
    zip: formatZip(cp.snapshot_zip ?? ""),
    addressPref: cp.snapshot_address_pref ?? "",
    addressCity: cp.snapshot_address_city ?? "",
    addressTown: cp.snapshot_address_town ?? "",
    addressLine1: cp.snapshot_address_line1 ?? "",
    addressLine2: cp.snapshot_address_line2 ?? "",
    addressFull,
    addressNoPref,
    phone: cp.snapshot_phone ?? "",
    fax: cp.snapshot_fax ?? "",
    email: cp.snapshot_email ?? "",
    corporateNumber: cp.snapshot_corporate_number ?? "",
    representativeName: cp.snapshot_representative_name ?? "",
  };
}

export function buildTransferContext(args: {
  caseRow: CaseRow;
  casePersons: CasePersonRow[];
  parcels: CaseParcelRow[];
  financial?: CaseFinancialRow | null;
}): TransferContext {
  const today = new Date();
  const byRole = new Map<string, PersonContext>();
  const applicantList: PersonContext[] = [];
  const neighborList: PersonContext[] = [];

  for (const cp of [...args.casePersons].sort((a, b) => a.sort_order - b.sort_order)) {
    const p = buildPersonContext(cp);
    if (!byRole.has(cp.role)) byRole.set(cp.role, p);
    if (cp.role === "applicant") applicantList.push(p);
    if (cp.role === "neighbor") neighborList.push(p);
  }

  const parcels: ParcelContext[] = [...args.parcels]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({
      pref: p.pref ?? "",
      city: p.city ?? "",
      aza: p.aza ?? "",
      chiban: p.chiban ?? "",
      locationFull: [p.city, p.aza, p.chiban].filter(Boolean).join(""),
      chimoku: p.chimoku ?? "",
      area:
        p.area != null
          ? p.area.toLocaleString("ja-JP", { minimumFractionDigits: 2 })
          : "",
      tenyoArea:
        p.tenyo_area != null
          ? p.tenyo_area.toLocaleString("ja-JP", { minimumFractionDigits: 2 })
          : "",
    }));

  const totalAreaNum = args.parcels.reduce((s, p) => s + Number(p.area ?? 0), 0);
  const totalTenyoNum = args.parcels.reduce((s, p) => s + Number(p.tenyo_area ?? 0), 0);

  const fin = args.financial;

  return {
    caseNumber: args.caseRow.case_number,
    caseName: args.caseRow.case_name,
    caseMemo: args.caseRow.memo ?? "",
    caseTypeLabel:
      (CaseTypeLabels as Record<string, string>)[args.caseRow.case_type] ??
      args.caseRow.case_type,
    submissionTarget: args.caseRow.submission_target ?? "",
    submissionDate: args.caseRow.submission_date
      ? toWareki(new Date(args.caseRow.submission_date))
      : "",
    deadlineDate: args.caseRow.deadline_date
      ? toWareki(new Date(args.caseRow.deadline_date))
      : "",
    today: toWareki(today),
    todayYear: `令和${today.getFullYear() - 2018}年`,
    todayMonth: String(today.getMonth() + 1),
    todayDay: String(today.getDate()),
    applicant: byRole.get("applicant") ?? EMPTY_PERSON,
    transferee: byRole.get("transferee") ?? EMPTY_PERSON,
    transferor: byRole.get("transferor") ?? EMPTY_PERSON,
    agent: byRole.get("agent") ?? EMPTY_PERSON,
    billing: byRole.get("billing") ?? EMPTY_PERSON,
    neighbor: byRole.get("neighbor") ?? EMPTY_PERSON,
    applicants: applicantList,
    neighbors: neighborList,
    parcels,
    parcel: parcels[0] ?? EMPTY_PARCEL,
    totalArea: totalAreaNum
      ? totalAreaNum.toLocaleString("ja-JP", { minimumFractionDigits: 2 })
      : "",
    totalTenyoArea: totalTenyoNum
      ? totalTenyoNum.toLocaleString("ja-JP", { minimumFractionDigits: 2 })
      : "",
    estimateAmount: amountStr(fin?.estimate_amount),
    estimateAmountTax: amountStr(taxOf(fin?.estimate_amount, fin?.tax_rate)),
    estimateAmountTotal: amountStr(totalOf(fin?.estimate_amount, fin?.tax_rate)),
    invoiceAmount: amountStr(fin?.invoice_amount),
    invoiceAmountTax: amountStr(taxOf(fin?.invoice_amount, fin?.tax_rate)),
    invoiceAmountTotal: amountStr(totalOf(fin?.invoice_amount, fin?.tax_rate)),
  };
}
