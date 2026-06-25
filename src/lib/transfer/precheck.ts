// see: docs/phase3/07_transfer_engine.md §転記前チェック（preCheck）
import type { TransferContext } from "@/types/transfer";
import { resolvePath, type Mapping } from "./engine";

export type PreCheckResult = {
  totalFields: number;
  filledFields: number;
  missingRequired: string[];
  missingOptional: string[];
  previewData: Record<string, string>;
};

export function formatMissingRequiredMessage(fields: string[]): string {
  const uniqueFields = Array.from(
    new Set(fields.map((field) => field.trim()).filter(Boolean)),
  );
  const visibleFields = uniqueFields.slice(0, 5).join("、");
  const rest =
    uniqueFields.length > 5 ? `、ほか${uniqueFields.length - 5}件` : "";

  return `必須フィールド（${visibleFields}${rest}）が未入力です。案件情報・関係者・土地情報を補完してから帳票を生成してください。`;
}

export function preCheck(ctx: TransferContext, mappings: Mapping[]): PreCheckResult {
  const result: PreCheckResult = {
    totalFields: mappings.length,
    filledFields: 0,
    missingRequired: [],
    missingOptional: [],
    previewData: {},
  };
  for (const m of mappings) {
    const v = resolvePath(ctx, m.fieldPath);
    result.previewData[m.fieldPath] = v;
    if (v) {
      result.filledFields++;
    } else if (m.isRequired) {
      result.missingRequired.push(m.label ?? m.fieldPath);
    } else {
      result.missingOptional.push(m.label ?? m.fieldPath);
    }
  }
  return result;
}
