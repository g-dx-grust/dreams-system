// see: docs/phase3/07_transfer_engine.md §Excel 転記（exceljs）
import ExcelJS from "exceljs";
import type { TransferContext } from "@/types/transfer";
import { canonicalizeFieldPath } from "./field-dict";
import { resolvePath, type Mapping } from "./engine";

const HIGHLIGHT_ARGB = "FFFFFF00";

export async function fillXlsx(
  templateBuffer: ArrayBuffer,
  context: TransferContext,
  mappings: Mapping[],
  highlight: boolean,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    Buffer.from(templateBuffer) as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0],
  );

  for (const mapping of mappings) {
    const value = resolvePath(context, mapping.fieldPath);
    if (value === "") continue;

    const { sheetName, cellRef } = parsePlaceholder(mapping.placeholder, wb);
    const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
    if (!ws) continue;

    try {
      const cell = ws.getCell(cellRef);
      const replaced = replaceCellPlaceholders(cell.value, mapping, value);
      cell.value = replaced ?? coerceValue(value);
      if (highlight) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: HIGHLIGHT_ARGB },
        };
      }
    } catch {
      // 無効なセル座標はスキップ
    }
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

function parsePlaceholder(
  raw: string,
  wb: ExcelJS.Workbook,
): { sheetName?: string; cellRef: string } {
  const m = raw.match(/^([^!]+)!(.+)$/);
  if (m && m[1] && m[2]) {
    return { sheetName: normalizeSheetName(m[1]), cellRef: m[2] };
  }

  const ranges = wb.definedNames.getRanges(raw);
  if (ranges && ranges.ranges.length > 0) {
    const r = ranges.ranges[0];
    if (r) {
      const mm = r.match(/^([^!]+)!(\$?[A-Z]+\$?\d+)$/);
      if (mm && mm[1] && mm[2])
        return {
          sheetName: normalizeSheetName(mm[1]),
          cellRef: mm[2].replace(/\$/g, ""),
        };
    }
  }
  return { cellRef: raw };
}

function normalizeSheetName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function coerceValue(v: string): string | number {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(v.replace(/,/g, "")) ? n : v;
}

function replaceCellPlaceholders(
  cellValue: ExcelJS.CellValue,
  mapping: Mapping,
  value: string,
): string | null {
  if (typeof cellValue !== "string") return null;

  const canonicalPath = canonicalizeFieldPath(mapping.fieldPath);
  const tokens = uniqueStrings([
    mapping.fieldPath,
    canonicalPath,
    mapping.placeholder,
    `{${mapping.fieldPath}}`,
    `{${canonicalPath}}`,
    `{${mapping.placeholder}}`,
  ]);
  let next = cellValue;

  for (const token of tokens) {
    const normalizedToken = token.startsWith("{") && token.endsWith("}") ? token : `{${token}}`;
    next = next.split(normalizedToken).join(value);
  }

  return next === cellValue ? null : next;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
