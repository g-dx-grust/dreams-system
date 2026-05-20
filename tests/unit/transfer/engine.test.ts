import { describe, it, expect } from "vitest";
import { resolvePath, resolveRawPath } from "@/lib/transfer/engine";

describe("resolvePath", () => {
  it("ネストしたキーを解決できる", () => {
    expect(resolvePath({ applicant: { name: "田中太郎" } }, "applicant.name")).toBe("田中太郎");
  });

  it("配列インデックスを解決できる", () => {
    const data = { parcels: [{ chiban: "123-4" }, { chiban: "456-7" }] };
    expect(resolvePath(data, "parcels[0].chiban")).toBe("123-4");
    expect(resolvePath(data, "parcels[1].chiban")).toBe("456-7");
  });

  it("存在しないパスは空文字を返す", () => {
    expect(resolvePath({ applicant: { name: "田中太郎" } }, "agent.name")).toBe("");
  });

  it("null のネストは空文字を返す", () => {
    expect(resolvePath({ a: null }, "a.b")).toBe("");
  });

  it("値が 0 の場合は '0' を返す", () => {
    expect(resolvePath({ count: 0 }, "count")).toBe("0");
  });

  it("トップレベルの文字列値を返す", () => {
    expect(resolvePath({ caseNumber: "2026-FC-001" }, "caseNumber")).toBe("2026-FC-001");
  });

  it("snake_case の旧フィールド名も解決できる", () => {
    expect(resolvePath({ caseNumber: "2026-FC-001" }, "case_number")).toBe("2026-FC-001");
    expect(
      resolvePath(
        { applicant: { addressFull: "愛知県豊橋市大岩町字大穴1-1" } },
        "applicant.address_full",
      ),
    ).toBe("愛知県豊橋市大岩町字大穴1-1");
  });
});

describe("resolveRawPath", () => {
  it("存在しないパスは undefined を返す", () => {
    expect(resolveRawPath({ applicant: { name: "田中太郎" } }, "agent.name")).toBeUndefined();
  });

  it("this で現在スコープを返せる", () => {
    const scope = { name: "田中太郎" };
    expect(resolveRawPath(scope, "this")).toBe(scope);
  });
});
