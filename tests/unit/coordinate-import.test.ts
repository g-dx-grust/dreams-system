import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseCoordinateCsv, parseCoordinateXlsx } from "@/lib/coordinate-import";

describe("coordinate import parser", () => {
  it("parses CSV rows with latitude and longitude headers", () => {
    const result = parseCoordinateCsv(
      [
        "点名,緯度,経度,備考",
        "基準点A,34.769123,137.391456,現地確認済",
        "基準点B,999,137.1,緯度範囲外",
      ].join("\n"),
    );

    expect(result.hasRequiredHeaders).toBe(true);
    expect(result.totalRows).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.points).toEqual([
      {
        pointName: "基準点A",
        lat: 34.769123,
        lng: 137.391456,
        memo: "現地確認済",
      },
    ]);
  });

  it("does not treat plane coordinate X/Y columns as latitude and longitude", () => {
    const result = parseCoordinateCsv(["点名,X,Y", "任意点A,1200.5,3400.1"].join("\n"));

    expect(result.hasRequiredHeaders).toBe(false);
    expect(result.points).toHaveLength(0);
  });

  it("parses XLSX rows from the first worksheet", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("座標");
    sheet.addRow(["name", "latitude", "longitude", "memo"]);
    sheet.addRow(["point-1", 34.769123, 137.391456, "xlsx"]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await parseCoordinateXlsx(buffer);

    expect(result.hasRequiredHeaders).toBe(true);
    expect(result.skipped).toBe(0);
    expect(result.points).toEqual([
      {
        pointName: "point-1",
        lat: 34.769123,
        lng: 137.391456,
        memo: "xlsx",
      },
    ]);
  });
});
