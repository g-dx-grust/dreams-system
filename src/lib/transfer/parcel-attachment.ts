// 筆別紙（全筆一覧）の生成
// see: 修正メモ20260520.md（別紙必要処理・筆メモの別紙作成・30筆あればよっぽど問題なし）
//
// 帳票テンプレートのマッピング枠（13 筆）に収まらない多数の筆を、
// 様式に依存しない 1 枚の Excel 一覧（別紙）として出力する。
import ExcelJS from "exceljs";

export type ParcelAttachmentRow = {
  sort_order: number;
  pref: string | null;
  city: string | null;
  oaza: string | null;
  aza: string | null;
  chiban: string | null;
  chimoku: string | null;
  area: number | null;
  tenyo_area: number | null;
  memo: string | null;
};

export type ParcelAttachmentCase = {
  case_number: string;
  case_name: string | null;
};

const HEADERS = [
  "No.",
  "都道府県",
  "市区町村",
  "大字",
  "字",
  "地番",
  "地目",
  "地積（㎡）",
  "転用面積（㎡）",
  "備考",
] as const;

const COLUMN_WIDTHS = [6, 12, 14, 16, 16, 14, 10, 14, 16, 24];
const HEADER_FILL_ARGB = "FFEEF1F6";
const BORDER_ARGB = "FFD0D5DD";

export function buildParcelAttachmentFileName(caseNumber: string): string {
  const safe = caseNumber.replace(/[\\/:*?"<>|　]/g, "_");
  return `${safe}_筆別紙_${buildDateStamp()}.xlsx`;
}

export async function buildParcelAttachmentXlsx(
  caseInfo: ParcelAttachmentCase,
  parcels: ParcelAttachmentRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "案件管理・帳票転記システム";
  const ws = wb.addWorksheet("筆一覧");

  ws.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  const lastCol = HEADERS.length;
  const lastColLetter = ws.getColumn(lastCol).letter;

  // タイトル
  ws.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = ws.getCell("A1");
  titleCell.value = "筆別紙（全筆一覧）";
  titleCell.font = { size: 14, bold: true };

  // 案件情報
  ws.mergeCells(`A2:${lastColLetter}2`);
  const infoCell = ws.getCell("A2");
  infoCell.value = `案件番号：${caseInfo.case_number}　案件名：${caseInfo.case_name ?? ""}`;
  infoCell.font = { size: 11 };

  // ヘッダー行
  const headerRowIndex = 4;
  const headerRow = ws.getRow(headerRowIndex);
  HEADERS.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL_ARGB },
    };
    cell.border = thinBorder();
  });
  headerRow.commit();

  // データ行
  const sorted = [...parcels].sort((a, b) => a.sort_order - b.sort_order);
  let totalArea = 0;
  let totalTenyo = 0;

  sorted.forEach((parcel, index) => {
    const rowIndex = headerRowIndex + 1 + index;
    const row = ws.getRow(rowIndex);
    const values = [
      index + 1,
      parcel.pref ?? "",
      parcel.city ?? "",
      parcel.oaza ?? "",
      parcel.aza ?? "",
      parcel.chiban ?? "",
      parcel.chimoku ?? "",
      parcel.area ?? null,
      parcel.tenyo_area ?? null,
      parcel.memo ?? "",
    ];
    values.forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = value;
      cell.border = thinBorder();
      if (colIndex === 0) cell.alignment = { horizontal: "center" };
      if (colIndex === 7 || colIndex === 8) {
        cell.numFmt = "#,##0.00";
        cell.alignment = { horizontal: "right" };
      }
    });
    row.commit();

    totalArea += Number(parcel.area ?? 0);
    totalTenyo += Number(parcel.tenyo_area ?? 0);
  });

  // 合計行
  const totalRowIndex = headerRowIndex + 1 + sorted.length;
  const totalRow = ws.getRow(totalRowIndex);
  const labelCell = totalRow.getCell(1);
  labelCell.value = "合計";
  labelCell.font = { bold: true };
  labelCell.alignment = { horizontal: "center" };
  ws.mergeCells(totalRowIndex, 1, totalRowIndex, 7);
  for (let col = 1; col <= 7; col += 1) {
    totalRow.getCell(col).border = thinBorder();
  }
  const totalAreaCell = totalRow.getCell(8);
  totalAreaCell.value = totalArea;
  totalAreaCell.numFmt = "#,##0.00";
  totalAreaCell.font = { bold: true };
  totalAreaCell.alignment = { horizontal: "right" };
  totalAreaCell.border = thinBorder();
  const totalTenyoCell = totalRow.getCell(9);
  totalTenyoCell.value = totalTenyo;
  totalTenyoCell.numFmt = "#,##0.00";
  totalTenyoCell.font = { bold: true };
  totalTenyoCell.alignment = { horizontal: "right" };
  totalTenyoCell.border = thinBorder();
  totalRow.getCell(10).border = thinBorder();
  totalRow.commit();

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER_ARGB } };
  return { top: side, left: side, bottom: side, right: side };
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
