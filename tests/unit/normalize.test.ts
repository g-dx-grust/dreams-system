import { describe, it, expect } from "vitest";
import { normalizeName, normalizeZip, normalizePhone } from "@/lib/normalize";

describe("normalizeName", () => {
  it("全角スペースを除去する", () => {
    expect(normalizeName("田中　太郎")).toBe("田中太郎");
  });

  it("半角スペースを除去する", () => {
    expect(normalizeName("田中 太郎")).toBe("田中太郎");
  });

  it("中点（・）を除去する", () => {
    expect(normalizeName("田中・太郎")).toBe("田中太郎");
  });

  it("全角英数字を半角に変換する", () => {
    expect(normalizeName("ＡＢＣ１２３")).toBe("abc123");
  });

  it("スペース・中点・全角英数の複合", () => {
    expect(normalizeName("田中 ・ 太郎")).toBe("田中太郎");
  });

  it("空文字はそのまま", () => {
    expect(normalizeName("")).toBe("");
  });
});

describe("normalizeZip", () => {
  it("ハイフン区切りの郵便番号を数字のみに変換する", () => {
    expect(normalizeZip("441-0807")).toBe("4410807");
  });

  it("7桁を超える入力は7桁に切り詰める", () => {
    expect(normalizeZip("12345678")).toBe("1234567");
  });

  it("数字以外を除去する", () => {
    expect(normalizeZip("〒441-0807")).toBe("4410807");
  });
});

describe("normalizePhone", () => {
  it("ハイフンを除去する", () => {
    expect(normalizePhone("0532-99-9999")).toBe("0532999999");
  });

  it("括弧つき市外局番を除去する", () => {
    expect(normalizePhone("(0532)99-9999")).toBe("0532999999");
  });

  it("数字のみならそのまま", () => {
    expect(normalizePhone("0532999999")).toBe("0532999999");
  });
});
