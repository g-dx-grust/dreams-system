import { describe, it, expect } from "vitest";
import { buildPersonContext } from "@/lib/transfer/context-builder";
import type { CasePersonRow } from "@/server/cases";

function makePersonRow(overrides: Partial<CasePersonRow> = {}): CasePersonRow {
  return {
    id: 1,
    case_id: 1,
    person_id: 1,
    role: "applicant",
    sort_order: 0,
    snapshot_name: null,
    snapshot_name_kana: null,
    snapshot_zip: null,
    snapshot_address_pref: null,
    snapshot_address_city: null,
    snapshot_address_town: null,
    snapshot_address_line1: null,
    snapshot_address_line2: null,
    snapshot_phone: null,
    snapshot_fax: null,
    snapshot_email: null,
    snapshot_corporate_number: null,
    snapshot_representative_name: null,
    snapshot_at: null,
    memo: null,
    ...overrides,
  };
}

describe("buildPersonContext", () => {
  it("スナップショットから住所を結合する", () => {
    const cp = makePersonRow({
      snapshot_name: "田中 太郎",
      snapshot_address_pref: "愛知県",
      snapshot_address_city: "豊橋市",
      snapshot_address_town: "大岩町",
      snapshot_address_line1: "字大穴1-1",
      snapshot_address_line2: null,
    });
    const p = buildPersonContext(cp);
    expect(p.addressFull).toBe("愛知県豊橋市大岩町字大穴1-1");
    expect(p.addressNoPref).toBe("豊橋市大岩町字大穴1-1");
  });

  it("address_line2 が存在する場合も結合される", () => {
    const cp = makePersonRow({
      snapshot_address_pref: "東京都",
      snapshot_address_city: "千代田区",
      snapshot_address_town: "丸の内",
      snapshot_address_line1: "1-1",
      snapshot_address_line2: "丸の内ビル301",
    });
    const p = buildPersonContext(cp);
    expect(p.addressFull).toBe("東京都千代田区丸の内1-1丸の内ビル301");
  });

  it("null フィールドはスキップされる", () => {
    const cp = makePersonRow({
      snapshot_address_pref: "愛知県",
      snapshot_address_city: null,
      snapshot_address_town: null,
      snapshot_address_line1: "豊橋市大岩町1-1",
      snapshot_address_line2: null,
    });
    const p = buildPersonContext(cp);
    expect(p.addressFull).toBe("愛知県豊橋市大岩町1-1");
    expect(p.addressNoPref).toBe("豊橋市大岩町1-1");
  });

  it("氏名・かなを返す", () => {
    const cp = makePersonRow({
      snapshot_name: "山田 花子",
      snapshot_name_kana: "ヤマダ ハナコ",
    });
    const p = buildPersonContext(cp);
    expect(p.name).toBe("山田 花子");
    expect(p.nameKana).toBe("ヤマダ ハナコ");
  });

  it("郵便番号をフォーマットする", () => {
    const cp = makePersonRow({ snapshot_zip: "4410807" });
    const p = buildPersonContext(cp);
    expect(p.zip).toBe("441-0807");
  });

  it("FAX と法人情報を返す", () => {
    const cp = makePersonRow({
      snapshot_fax: "0532-11-2222",
      snapshot_corporate_number: "1234567890123",
      snapshot_representative_name: "山田 一郎",
    });
    const p = buildPersonContext(cp);
    expect(p.fax).toBe("0532-11-2222");
    expect(p.corporateNumber).toBe("1234567890123");
    expect(p.representativeName).toBe("山田 一郎");
  });

  it("すべて null の場合は空文字", () => {
    const cp = makePersonRow();
    const p = buildPersonContext(cp);
    expect(p.name).toBe("");
    expect(p.addressFull).toBe("");
    expect(p.zip).toBe("");
  });
});
