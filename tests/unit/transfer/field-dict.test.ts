import { describe, expect, it } from "vitest";
import { canonicalizeFieldPath, suggestFieldEntry } from "@/lib/transfer/field-dict";

describe("field dictionary", () => {
  it("所有地一覧で使う13筆目までの土地フィールドを選択できる", () => {
    expect(suggestFieldEntry("parcels[12].area")).toMatchObject({
      path: "parcels[12].area",
      label: "13筆目 地積",
    });
    expect(canonicalizeFieldPath("parcels[12].tenyo_area")).toBe(
      "parcels[12].tenyoArea",
    );
  });
});
