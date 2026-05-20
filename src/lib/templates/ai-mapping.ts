import { z } from "zod";
import {
  FIELD_DICT,
  canonicalizeFieldPath,
  fieldLabel,
  suggestFieldEntry,
} from "@/lib/transfer/field-dict";
import type { TemplateMappingRow, TemplatePreview, TemplatePreviewSheet } from "@/server/templates";

export const AI_MAPPING_MODEL_DEFAULT = "gpt-5.4-mini";
export const HIGH_CONFIDENCE_THRESHOLD = 0.8;

export const AiMappingCandidateSchema = z.object({
  placeholder: z.string(),
  fieldPath: z.string(),
  label: z.string(),
  confidence: z.number(),
  reason: z.string(),
  warning: z.string().nullable(),
});

export const AiMappingSuggestionSchema = z.object({
  candidates: z.array(AiMappingCandidateSchema),
  warnings: z.array(z.string()),
});

export type TemplateMappingCandidate = z.infer<typeof AiMappingCandidateSchema>;
export type TemplateMappingSuggestion = z.infer<typeof AiMappingSuggestionSchema>;

type AiMappingTemplateMeta = {
  id: number;
  name: string;
  fileType: string;
  description: string | null;
  categoryName?: string | null;
};

type AiMappingPayload = {
  template: AiMappingTemplateMeta;
  fieldDictionary: Array<{
    path: string;
    label: string;
    group: string;
    aliases?: string[];
  }>;
  existingMappings: Array<{
    placeholder: string;
    fieldPath: string;
    label: string | null;
    isRequired: boolean;
  }>;
  preview: ReturnType<typeof buildAiPreviewPayload>;
  rules: string[];
};

type NearbyCell = {
  direction: string;
  address: string;
  value: string;
};

const MAX_TEXT_CELLS_PER_SHEET = 220;
const MAX_EMPTY_CELLS_PER_SHEET = 260;
const MAX_DOCX_BLOCKS = 80;
const PARTIAL_DATE_CELL_RE = /(?:令和|平成|昭和)?[\s　]*年[\s　]*月[\s　]*日/;

export const TEMPLATE_MAPPING_SYSTEM_PROMPT = [
  "あなたは日本の行政書類テンプレートのマッピング候補を作る支援AIです。",
  "目的は管理者が確認して採用できる候補を作ることです。自動保存や確定判断はしません。",
  "fieldPath は必ず fieldDictionary にある path を優先してください。辞書にない fieldPath は warning を入れてください。",
  "Excel では空白セルも候補対象です。特に「氏名」「住所」「地番」などの右隣・下・近くの空白セルを周辺ラベルから推定してください。",
  "Excel の固定ラベルだけが入ったセルは原則候補にしないでください。候補にするのは空白セル、またはプレースホルダーらしいセルです。",
  "「令和　年　月　日」のようなセル内空欄への年・月・日だけの部分差し込みは、現在のセル単位転記ではできません。候補にする場合は warning を入れ、可能なら候補ではなく warnings にしてください。",
  "Word では { } の差し込み名と周辺文脈から fieldPath を推定してください。",
  "confidence は 0 から 1 の数値、reason と warning は日本語で短く書いてください。warning がなければ null にしてください。",
].join("\n");

export function buildAiMappingPayload(input: {
  template: AiMappingTemplateMeta;
  preview: TemplatePreview;
  existingMappings: TemplateMappingRow[];
}): AiMappingPayload {
  return {
    template: input.template,
    fieldDictionary: FIELD_DICT.map((field) => ({
      path: field.path,
      label: field.label,
      group: field.group,
      ...(field.aliases ? { aliases: field.aliases } : {}),
    })),
    existingMappings: input.existingMappings.map((mapping) => ({
      placeholder: mapping.placeholder,
      fieldPath: canonicalizeFieldPath(mapping.field_path),
      label: mapping.label,
      isRequired: mapping.is_required ?? false,
    })),
    preview: buildAiPreviewPayload(input.preview),
    rules: [
      "ファイル本体ではなく、このプレビュー情報だけを使って判断する",
      "採用済みの既存マッピングと同じ placeholder は、より自然な候補がある場合だけ出す",
      "同じ placeholder に複数の候補があり得る場合は、confidence を下げて理由で迷いを説明する",
      "候補が弱い場合は candidates を増やしすぎず、warnings に理由を書く",
    ],
  };
}

export function buildAiPreviewWarnings(preview: TemplatePreview): string[] {
  if (preview.fileType !== "xlsx") return [];

  return findPartialDateCells(preview).map(
    (cell) =>
      `${cell.target} に「${shorten(cell.value, 28)}」があります。現在の転記はセル全体への入力のみのため、年・月・日だけをセル内の空欄へ差し込むことはできません。`,
  );
}

export function normalizeAiMappingSuggestion(
  suggestion: TemplateMappingSuggestion,
  preview: TemplatePreview,
): TemplateMappingSuggestion {
  const previewWarnings = buildAiPreviewWarnings(preview);
  const partialDateWarnings = buildPartialDateWarningMap(preview);
  const seen = new Set<string>();
  const candidates: TemplateMappingCandidate[] = [];

  for (const candidate of suggestion.candidates) {
    const placeholder = candidate.placeholder.trim();
    const fieldPath = candidate.fieldPath.trim();
    if (!placeholder || !fieldPath) continue;

    const found = suggestFieldEntry(fieldPath);
    const canonicalPath = found?.path ?? canonicalizeFieldPath(fieldPath);
    const warnings = [
      candidate.warning?.trim() || null,
      found ? null : "辞書にないフィールドパスです。採用前に右側の辞書から選び直してください。",
      partialDateWarnings.get(normalizePlaceholderKey(placeholder)) ?? null,
    ].filter(Boolean) as string[];
    const key = `${normalizePlaceholderKey(placeholder)}\n${canonicalPath}`;
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({
      placeholder,
      fieldPath: canonicalPath,
      label: candidate.label.trim() || found?.label || fieldLabel(canonicalPath),
      confidence: clampConfidence(candidate.confidence),
      reason: candidate.reason.trim() || "プレビュー情報から推定しました。",
      warning: warnings.length > 0 ? uniqueStrings(warnings).join(" / ") : null,
    });
  }

  return {
    candidates: candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 80),
    warnings: uniqueStrings([
      ...previewWarnings,
      ...suggestion.warnings.map((warning) => warning.trim()).filter(Boolean),
    ]).slice(0, 30),
  };
}

function buildAiPreviewPayload(preview: TemplatePreview) {
  if (preview.fileType === "docx") {
    return {
      fileType: "docx" as const,
      truncated: preview.truncated,
      placeholders: preview.placeholders,
      blocks: preview.blocks.slice(0, MAX_DOCX_BLOCKS).map((block) => ({
        id: block.id,
        text: block.parts
          .map((part) => (part.type === "placeholder" ? `{${part.key}}` : part.text))
          .join(""),
        placeholders: block.parts
          .filter(
            (part): part is { type: "placeholder"; key: string } => part.type === "placeholder",
          )
          .map((part) => part.key),
      })),
    };
  }

  return {
    fileType: "xlsx" as const,
    truncated: preview.truncated,
    sheets: preview.sheets.map((sheet) => {
      const { textCells, emptyCellsNearText } = summarizeXlsxSheet(sheet, preview.sheets.length);
      return {
        name: sheet.name,
        truncated: sheet.truncated,
        columns: sheet.columns,
        textCells,
        emptyCellsNearText,
      };
    }),
    partialDateCells: findPartialDateCells(preview),
  };
}

function summarizeXlsxSheet(sheet: TemplatePreviewSheet, sheetCount: number) {
  const textCells: Array<{ address: string; target: string; value: string }> = [];
  const emptyCellsNearText: Array<{
    address: string;
    target: string;
    nearby: NearbyCell[];
  }> = [];
  const valueMap = new Map<string, string>();

  for (const row of sheet.rows) {
    for (const cell of row.cells) {
      valueMap.set(cell.address, cell.value.trim());
      if (cell.value.trim() && textCells.length < MAX_TEXT_CELLS_PER_SHEET) {
        textCells.push({
          address: cell.address,
          target: mappingTargetForCell(sheet.name, sheetCount, cell.address),
          value: shorten(cell.value.trim(), 80),
        });
      }
    }
  }

  for (const row of sheet.rows) {
    for (const cell of row.cells) {
      if (cell.value.trim()) continue;
      const nearby = collectNearbyTextCells(sheet, cell.address, valueMap);
      if (nearby.length === 0) continue;
      emptyCellsNearText.push({
        address: cell.address,
        target: mappingTargetForCell(sheet.name, sheetCount, cell.address),
        nearby,
      });
      if (emptyCellsNearText.length >= MAX_EMPTY_CELLS_PER_SHEET) break;
    }
    if (emptyCellsNearText.length >= MAX_EMPTY_CELLS_PER_SHEET) break;
  }

  return { textCells, emptyCellsNearText };
}

function collectNearbyTextCells(
  sheet: TemplatePreviewSheet,
  address: string,
  valueMap: Map<string, string>,
): NearbyCell[] {
  const pos = parseCellAddress(address);
  if (!pos) return [];

  const offsets: Array<{ direction: string; row: number; col: number }> = [
    { direction: "left", row: 0, col: -1 },
    { direction: "left2", row: 0, col: -2 },
    { direction: "right", row: 0, col: 1 },
    { direction: "up", row: -1, col: 0 },
    { direction: "up2", row: -2, col: 0 },
    { direction: "down", row: 1, col: 0 },
    { direction: "upLeft", row: -1, col: -1 },
    { direction: "downLeft", row: 1, col: -1 },
  ];
  const nearby: NearbyCell[] = [];

  for (const offset of offsets) {
    const rowNumber = pos.row + offset.row;
    const colNumber = pos.col + offset.col;
    if (rowNumber < 1 || colNumber < 1 || colNumber > sheet.columns.length) continue;
    const nearbyAddress = `${columnNumberToName(colNumber)}${rowNumber}`;
    const value = valueMap.get(nearbyAddress);
    if (!value) continue;
    nearby.push({
      direction: offset.direction,
      address: nearbyAddress,
      value: shorten(value, 64),
    });
  }

  return nearby.slice(0, 8);
}

function findPartialDateCells(preview: TemplatePreview) {
  if (preview.fileType !== "xlsx") return [];

  return preview.sheets.flatMap((sheet) =>
    sheet.rows.flatMap((row) =>
      row.cells
        .filter((cell) => isPartialDateCellValue(cell.value))
        .map((cell) => ({
          sheetName: sheet.name,
          address: cell.address,
          target: mappingTargetForCell(sheet.name, preview.sheets.length, cell.address),
          value: cell.value.trim(),
        })),
    ),
  );
}

function buildPartialDateWarningMap(preview: TemplatePreview): Map<string, string> {
  const warnings = new Map<string, string>();
  if (preview.fileType !== "xlsx") return warnings;

  for (const cell of findPartialDateCells(preview)) {
    const warning =
      "このセルは「令和 年 月 日」のようなセル内空欄です。現在の転記はセル単位のため、年・月・日だけを部分的に差し込めません。";
    warnings.set(normalizePlaceholderKey(cell.target), warning);
    warnings.set(normalizePlaceholderKey(`${cell.sheetName}!${cell.address}`), warning);
    warnings.set(normalizePlaceholderKey(cell.address), warning);
  }

  return warnings;
}

function isPartialDateCellValue(value: string) {
  return PARTIAL_DATE_CELL_RE.test(value.replace(/[＿_]+/g, " "));
}

function mappingTargetForCell(sheetName: string, sheetCount: number, address: string) {
  return sheetCount > 1 ? `${sheetName}!${address}` : address;
}

function parseCellAddress(address: string): { col: number; row: number } | null {
  const match = address.match(/^([A-Z]+)(\d+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { col: columnNameToNumber(match[1]), row: Number(match[2]) };
}

function columnNameToNumber(columnName: string) {
  return columnName.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
}

function columnNumberToName(columnNumber: number) {
  let value = columnNumber;
  let name = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
}

function normalizePlaceholderKey(value: string) {
  return value.trim().toLowerCase();
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function shorten(value: string, maxLength: number) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1)}…`;
}
