import { describe, expect, it } from "vitest";
import {
  buildAiMappingPayload,
  buildAiPreviewWarnings,
  normalizeAiMappingSuggestion,
  type TemplateMappingSuggestion,
} from "@/lib/templates/ai-mapping";
import type { TemplateMappingRow, TemplatePreview } from "@/server/templates";

function xlsxPreview(): TemplatePreview {
  return {
    fileType: "xlsx",
    truncated: false,
    sheets: [
      {
        name: "申請書",
        columns: ["A", "B", "C"],
        truncated: false,
        rows: [
          {
            number: 1,
            cells: [
              { col: "A", address: "A1", value: "氏名" },
              { col: "B", address: "B1", value: "" },
              { col: "C", address: "C1", value: "" },
            ],
          },
          {
            number: 2,
            cells: [
              { col: "A", address: "A2", value: "令和　年　月　日" },
              { col: "B", address: "B2", value: "" },
              { col: "C", address: "C2", value: "" },
            ],
          },
        ],
      },
    ],
  };
}

describe("AI mapping helpers", () => {
  it("Excelの空白セルに周辺ラベルを付けてAI入力へ渡す", () => {
    const payload = buildAiMappingPayload({
      template: {
        id: 1,
        name: "申請書",
        fileType: "xlsx",
        description: null,
        categoryName: "農地",
      },
      preview: xlsxPreview(),
      existingMappings: [] satisfies TemplateMappingRow[],
    });

    expect(payload.preview.fileType).toBe("xlsx");
    if (payload.preview.fileType !== "xlsx") return;

    const b1 = payload.preview.sheets[0]?.emptyCellsNearText.find((cell) => cell.address === "B1");

    expect(b1?.target).toBe("B1");
    expect(b1?.nearby).toContainEqual({ direction: "left", address: "A1", value: "氏名" });
  });

  it("セル内の日付空欄は注意として補強する", () => {
    expect(buildAiPreviewWarnings(xlsxPreview())[0]).toContain("A2");
    expect(buildAiPreviewWarnings(xlsxPreview())[0]).toContain("セル全体");
  });

  it("辞書にないfieldPathとセル内空欄候補にwarningを付ける", () => {
    const suggestion: TemplateMappingSuggestion = {
      candidates: [
        {
          placeholder: "A2",
          fieldPath: "unknown.path",
          label: "不明",
          confidence: 2,
          reason: "",
          warning: null,
        },
      ],
      warnings: [],
    };

    const normalized = normalizeAiMappingSuggestion(suggestion, xlsxPreview());

    expect(normalized.candidates[0]?.confidence).toBe(1);
    expect(normalized.candidates[0]?.warning).toContain("辞書にないフィールドパス");
    expect(normalized.candidates[0]?.warning).toContain("部分的に差し込めません");
  });
});
