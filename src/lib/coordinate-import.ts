import ExcelJS from "exceljs";

export type ParsedCoordinatePoint = {
  pointName: string | null;
  lat: number;
  lng: number;
  memo: string | null;
};

export type CoordinateParseResult = {
  hasRequiredHeaders: boolean;
  points: ParsedCoordinatePoint[];
  skipped: number;
  totalRows: number;
};

type CoordinateColumnIndexes = {
  lat: number;
  lng: number;
  name: number | null;
  memo: number | null;
};

export async function parseCoordinateFileBuffer(
  buffer: Buffer,
  extension: "csv" | "xlsx",
): Promise<CoordinateParseResult> {
  return extension === "csv" ? parseCoordinateCsv(buffer.toString("utf8")) : parseCoordinateXlsx(buffer);
}

export function parseCoordinateCsv(text: string): CoordinateParseResult {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  return parseCoordinateRows(rows);
}

export async function parseCoordinateXlsx(buffer: Buffer): Promise<CoordinateParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    buffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0],
  );
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { hasRequiredHeaders: false, points: [], skipped: 0, totalRows: 0 };
  }

  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    for (let col = 1; col <= row.cellCount; col += 1) {
      values.push(cellValueToText(row.getCell(col).value));
    }
    if (values.some((value) => value.trim() !== "")) rows.push(values);
  });
  return parseCoordinateRows(rows);
}

function parseCoordinateRows(rows: string[][]): CoordinateParseResult {
  const headerIndex = rows.findIndex((row) => row.some((value) => value.trim() !== ""));
  if (headerIndex < 0) return { hasRequiredHeaders: false, points: [], skipped: 0, totalRows: 0 };

  const headers = rows[headerIndex] ?? [];
  const columns = detectCoordinateColumns(headers);
  if (!columns) {
    return { hasRequiredHeaders: false, points: [], skipped: 0, totalRows: 0 };
  }

  const points: ParsedCoordinatePoint[] = [];
  let skipped = 0;
  const dataRows = rows.slice(headerIndex + 1);

  for (const row of dataRows) {
    if (row.every((value) => value.trim() === "")) continue;
    const lat = parseCoordinateNumber(row[columns.lat] ?? "");
    const lng = parseCoordinateNumber(row[columns.lng] ?? "");
    if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      skipped += 1;
      continue;
    }
    points.push({
      pointName: textOrNull(columns.name == null ? null : row[columns.name]),
      lat,
      lng,
      memo: textOrNull(columns.memo == null ? null : row[columns.memo]),
    });
  }

  return {
    hasRequiredHeaders: true,
    points,
    skipped,
    totalRows: dataRows.filter((row) => row.some((value) => value.trim() !== "")).length,
  };
}

function detectCoordinateColumns(headers: string[]): CoordinateColumnIndexes | null {
  let lat: number | null = null;
  let lng: number | null = null;
  let name: number | null = null;
  let memo: number | null = null;

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (lat == null && isLatitudeHeader(normalized)) lat = index;
    if (lng == null && isLongitudeHeader(normalized)) lng = index;
    if (name == null && isNameHeader(normalized)) name = index;
    if (memo == null && isMemoHeader(normalized)) memo = index;
  });

  return lat == null || lng == null ? null : { lat, lng, name, memo };
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-()（）［］\[\]【】]/g, "");
}

function isLatitudeHeader(value: string): boolean {
  return (
    value.includes("緯度") ||
    value === "lat" ||
    value === "latitude" ||
    value === "wgs84lat" ||
    value === "jgd2011lat"
  );
}

function isLongitudeHeader(value: string): boolean {
  return (
    value.includes("経度") ||
    value === "lng" ||
    value === "lon" ||
    value === "long" ||
    value === "longitude" ||
    value === "wgs84lng" ||
    value === "wgs84lon" ||
    value === "jgd2011lng" ||
    value === "jgd2011lon"
  );
}

function isNameHeader(value: string): boolean {
  return (
    value.includes("点名") ||
    value.includes("名称") ||
    value.includes("基準点名") ||
    value === "name" ||
    value === "pointname" ||
    value === "point" ||
    value === "title"
  );
}

function isMemoHeader(value: string): boolean {
  return (
    value === "memo" ||
    value === "note" ||
    value === "comment" ||
    value.includes("備考") ||
    value.includes("メモ")
  );
}

function parseCoordinateNumber(value: string): number | null {
  const trimmed = value.trim().replace(/[°度]/g, "");
  const normalized = trimmed.replace(/,/g, "");
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, 200);
}

function cellValueToText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const objectValue = value as {
    text?: unknown;
    result?: unknown;
    richText?: Array<{ text?: unknown }>;
  };
  if (typeof objectValue.text === "string") return objectValue.text;
  if (objectValue.result != null) return cellValueToText(objectValue.result as ExcelJS.CellValue);
  if (Array.isArray(objectValue.richText)) {
    return objectValue.richText
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("");
  }
  return String(value);
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (char === "\r" && next === "\n") index += 1;
      continue;
    }
    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}
