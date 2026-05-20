import { describe, it, expect } from "vitest";
import { toWareki, toWarekiFromISODate } from "@/lib/transfer/wareki";

describe("toWareki", () => {
  it("2026年は令和8年", () => {
    expect(toWareki(new Date(2026, 3, 23))).toBe("令和8年4月23日");
  });

  it("2019年5月1日は令和1年（元年表記は使わない）", () => {
    expect(toWareki(new Date(2019, 4, 1))).toBe("令和1年5月1日");
  });

  it("2019年4月30日は平成31年", () => {
    expect(toWareki(new Date(2019, 3, 30))).toBe("平成31年4月30日");
  });

  it("2000年は平成12年", () => {
    expect(toWareki(new Date(2000, 0, 1))).toBe("平成12年1月1日");
  });

  it("1989年1月8日は平成1年", () => {
    expect(toWareki(new Date(1989, 0, 8))).toBe("平成1年1月8日");
  });

  it("Invalid Date は空文字を返す", () => {
    expect(toWareki(new Date("invalid"))).toBe("");
  });
});

describe("toWarekiFromISODate", () => {
  it("YYYY-MM-DD 形式を変換できる", () => {
    expect(toWarekiFromISODate("2026-04-23")).toBe("令和8年4月23日");
  });

  it("不正な形式は空文字を返す", () => {
    expect(toWarekiFromISODate("2026/04/23")).toBe("");
    expect(toWarekiFromISODate("")).toBe("");
    expect(toWarekiFromISODate("abc")).toBe("");
  });
});
