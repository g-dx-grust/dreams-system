// see: docs/phase3/07_transfer_engine.md §Excel 転記（exceljs）
import ExcelJS from "exceljs";
import type { TransferContext } from "@/types/transfer";
import { canonicalizeFieldPath } from "./field-dict";
import { resolvePath, resolveRawPath, type Mapping } from "./engine";

const HIGHLIGHT_ARGB = "FFFFFF00";
const LOOP_NAME_RE = /^loop_([a-zA-Z0-9_]+)_start$/;

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

  expandLoopRows(wb, context);

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

type LoopMarker = {
  collectionName: string;
  sheetName: string;
  startRow: number;
  endRow: number;
};

type TemplateCell = {
  col: number;
  value: ExcelJS.CellValue;
  style: Partial<ExcelJS.Style>;
};

type TemplateRow = {
  height?: number;
  hidden?: boolean;
  outlineLevel?: number;
  cells: TemplateCell[];
};

function expandLoopRows(wb: ExcelJS.Workbook, context: TransferContext) {
  for (const marker of findLoopMarkers(wb)) {
    const ws = wb.getWorksheet(marker.sheetName);
    if (!ws) continue;

    const collection = resolveRawPath(context, marker.collectionName);
    if (!Array.isArray(collection)) continue;

    const rowCount = marker.endRow - marker.startRow + 1;
    if (rowCount <= 0) continue;

    const templateRows = captureRows(ws, marker.startRow, marker.endRow);
    if (collection.length === 0) {
      ws.spliceRows(marker.startRow, rowCount);
      continue;
    }

    const additionalRowCount = rowCount * (collection.length - 1);
    if (additionalRowCount > 0) {
      ws.spliceRows(marker.endRow + 1, 0, ...Array.from({ length: additionalRowCount }, () => []));
    }

    collection.forEach((item, itemIndex) => {
      templateRows.forEach((templateRow, rowOffset) => {
        const targetRowNumber = marker.startRow + itemIndex * rowCount + rowOffset;
        applyTemplateRow(ws, targetRowNumber, templateRow, {
          context,
          collectionName: marker.collectionName,
          item,
        });
      });
    });
  }
}

function findLoopMarkers(wb: ExcelJS.Workbook): LoopMarker[] {
  const rangesByName = definedNameRanges(wb);
  const markers: LoopMarker[] = [];

  rangesByName.forEach((startRange, name) => {
    const match = name.match(LOOP_NAME_RE);
    if (!match?.[1]) return;

    const endRange = rangesByName.get(`loop_${match[1]}_end`);
    if (!endRange || startRange.sheetName !== endRange.sheetName) return;

    const startRow = rowNumberFromCellRef(startRange.cellRef);
    const endRow = rowNumberFromCellRef(endRange.cellRef);
    if (startRow == null || endRow == null || endRow < startRow) return;

    markers.push({
      collectionName: match[1],
      sheetName: startRange.sheetName,
      startRow,
      endRow,
    });
  });

  return markers.sort((a, b) => b.startRow - a.startRow);
}

function definedNameRanges(
  wb: ExcelJS.Workbook,
): Map<string, { sheetName: string; cellRef: string }> {
  const ranges = new Map<string, { sheetName: string; cellRef: string }>();
  const matrixMap = (wb.definedNames as unknown as { matrixMap?: Record<string, unknown> })
    .matrixMap;
  if (!matrixMap) return ranges;

  Object.keys(matrixMap).forEach((name) => {
    const range = rangeFromDefinedName(wb, name);
    if (range) ranges.set(name, range);
  });

  return ranges;
}

function rangeFromDefinedName(
  wb: ExcelJS.Workbook,
  name: string,
): { sheetName: string; cellRef: string } | null {
  const ranges = wb.definedNames.getRanges(name);
  const rawRange = ranges?.ranges[0];
  if (!rawRange) return null;

  const match = rawRange.match(/^([^!]+)!(\$?[A-Z]+\$?\d+)$/);
  if (!match?.[1] || !match[2]) return null;

  return {
    sheetName: normalizeSheetName(match[1]),
    cellRef: match[2].replace(/\$/g, ""),
  };
}

function rowNumberFromCellRef(cellRef: string): number | null {
  const match = cellRef.match(/\d+$/);
  if (!match?.[0]) return null;
  const rowNumber = Number(match[0]);
  return Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber : null;
}

function captureRows(ws: ExcelJS.Worksheet, startRow: number, endRow: number): TemplateRow[] {
  const rows: TemplateRow[] = [];
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    const cells: TemplateCell[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells.push({
        col,
        value: cloneValue(cell.value),
        style: cloneValue(cell.style),
      });
    });
    rows.push({
      height: row.height,
      hidden: row.hidden,
      outlineLevel: row.outlineLevel,
      cells,
    });
  }
  return rows;
}

function applyTemplateRow(
  ws: ExcelJS.Worksheet,
  rowNumber: number,
  templateRow: TemplateRow,
  scope: { context: TransferContext; collectionName: string; item: unknown },
) {
  const row = ws.getRow(rowNumber);
  if (templateRow.height !== undefined) row.height = templateRow.height;
  if (templateRow.hidden !== undefined) row.hidden = templateRow.hidden;
  if (templateRow.outlineLevel !== undefined) row.outlineLevel = templateRow.outlineLevel;

  for (const templateCell of templateRow.cells) {
    const cell = row.getCell(templateCell.col);
    cell.value = replaceLoopPlaceholders(templateCell.value, scope);
    cell.style = cloneValue(templateCell.style);
  }
  row.commit();
}

function replaceLoopPlaceholders(
  cellValue: ExcelJS.CellValue,
  scope: { context: TransferContext; collectionName: string; item: unknown },
): ExcelJS.CellValue {
  if (typeof cellValue !== "string") return cloneValue(cellValue);

  const next = cellValue.replace(/\{([^{}]+)\}/g, (_matched, rawToken: string) =>
    resolveLoopToken(rawToken, scope),
  );

  return cellValue.trim().match(/^\{[^{}]+\}$/) ? coerceValue(next) : next;
}

function resolveLoopToken(
  rawToken: string,
  scope: { context: TransferContext; collectionName: string; item: unknown },
): string {
  const token = canonicalizeFieldPath(rawToken.trim());
  const singularName = singularizeCollectionName(scope.collectionName);
  const itemPrefixes = [`${singularName}.`, `${scope.collectionName}.`, "this."];

  for (const prefix of itemPrefixes) {
    if (token.startsWith(prefix)) {
      return resolvePath(scope.item, token.slice(prefix.length));
    }
  }

  const itemValue = resolvePath(scope.item, token);
  return itemValue || resolvePath(scope.context, token);
}

function singularizeCollectionName(collectionName: string): string {
  if (collectionName === "parcels") return "parcel";
  if (collectionName.endsWith("ies")) return `${collectionName.slice(0, -3)}y`;
  if (collectionName.endsWith("s")) return collectionName.slice(0, -1);
  return collectionName;
}

function cloneValue<T>(value: T): T {
  if (value == null) return value;
  return structuredClone(value);
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
