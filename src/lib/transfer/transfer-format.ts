// see: docs/phase3/07_transfer_engine.md §ファイル命名規則

export function formatZip(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 7);
  if (digits.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return raw;
}

export function formatPhone(raw: string): string {
  return raw; // 正規化はnormalizePhone済みの値が来る想定。表示用の加工はしない
}

export function buildFileName(
  caseNumber: string,
  templateName: string,
  version: number,
  fileType: "docx" | "xlsx",
): string {
  const safeName = templateName.replace(/[\\/:*?"<>|　]/g, "_");
  const ymd = buildDateStamp();
  return `${caseNumber}_${safeName}_${ymd}_v${version}.${fileType}`;
}

export function buildStorageCaseFolder(caseNumber: string): string {
  return sanitizeStorageSegment(caseNumber, "case");
}

export function buildStorageFileName(
  caseNumber: string,
  templateId: number,
  version: number,
  fileType: "docx" | "xlsx",
): string {
  const ymd = buildDateStamp();
  const safeCaseNumber = sanitizeStorageSegment(caseNumber, "case");
  return `${safeCaseNumber}_template-${templateId}_${ymd}_v${version}.${fileType}`;
}

export function amountStr(v: number | null | undefined): string {
  if (v == null) return "";
  return v.toLocaleString("ja-JP");
}

export function taxOf(
  amount: number | null | undefined,
  rate: number | null | undefined,
): number | null {
  if (amount == null || rate == null) return null;
  return Math.floor((amount * rate) / 100);
}

export function totalOf(
  amount: number | null | undefined,
  rate: number | null | undefined,
): number | null {
  const tax = taxOf(amount, rate);
  if (amount == null || tax == null) return null;
  return amount + tax;
}

function buildDateStamp(): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}${get("month")}${get("day")}`;
}

function sanitizeStorageSegment(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}
