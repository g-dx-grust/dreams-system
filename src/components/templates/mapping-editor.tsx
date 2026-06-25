"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  BookText,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  Plus,
  Search,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { suggestTemplateMappings, upsertMappings } from "@/server/templates";
import type { TemplateMappingRow, TemplatePreview } from "@/server/templates";
import type {
  TemplateMappingCandidate,
  TemplateMappingSuggestion,
} from "@/lib/templates/ai-mapping";
import {
  FIELD_GROUPS,
  fieldLabel,
  suggestFieldEntry,
  type FieldEntry,
} from "@/lib/transfer/field-dict";
import { cn } from "@/lib/cn";

type MappingRow = {
  id?: number;
  placeholder: string;
  fieldPath: string;
  label: string;
  isRequired: boolean;
};

type RowStatus = "complete" | "needsInput" | "warning";
type MappingRowSummary = {
  matchedField?: FieldEntry;
  isUnknownField: boolean;
  isDuplicate: boolean;
  status: RowStatus;
};
type XlsxPreview = Extract<TemplatePreview, { fileType: "xlsx" }>;
type XlsxPreviewCell = XlsxPreview["sheets"][number]["rows"][number]["cells"][number];

const HIGH_CONFIDENCE_THRESHOLD = 0.8;

type Props = {
  templateId: number;
  templateName: string;
  templateMeta: string;
  backHref: string;
  initialMappings: TemplateMappingRow[];
  fileType: string;
  initialPreview: TemplatePreview | null;
  initialPreviewError: string | null;
};

function normalizePlaceholder(value: string) {
  return value.trim().toLowerCase();
}

function fileTypeGuide(fileType: string) {
  if (fileType === "xlsx") {
    return {
      icon: FileSpreadsheet,
      title: "Excel マッピング",
      placeholderLabel: "セル座標",
      placeholderHint: "例: B5 / Sheet1!B5",
      targetHelp: "左のプレビューで転記したいセルをクリックします。",
    };
  }

  return {
    icon: FileText,
    title: "Word マッピング",
    placeholderLabel: "差し込み名",
    placeholderHint: "例: applicant.name",
    targetHelp: "左のプレビューで { } の差し込み名をクリックします。",
  };
}

function rowStatus(row: MappingRow, isUnknownField: boolean, isDuplicate: boolean): RowStatus {
  if (!row.placeholder.trim() || !row.fieldPath.trim()) return "needsInput";
  if (isUnknownField || isDuplicate) return "warning";
  return "complete";
}

function rowStatusBadge(status: RowStatus) {
  switch (status) {
    case "complete":
      return { tone: "success" as const, label: "完了" };
    case "warning":
      return { tone: "warning" as const, label: "確認" };
    default:
      return { tone: "danger" as const, label: "未設定" };
  }
}

function findMappingByTarget(rows: MappingRow[], target: string) {
  const normalizedTarget = normalizePlaceholder(target);
  return rows.find((row) => normalizePlaceholder(row.placeholder) === normalizedTarget);
}

function mappingTargetForCell(sheetName: string, sheetCount: number, address: string) {
  return sheetCount > 1 ? `${sheetName}!${address}` : address;
}

function isXlsxPreview(preview: TemplatePreview | null): preview is XlsxPreview {
  return preview?.fileType === "xlsx";
}

function splitXlsxTarget(
  target: string,
  preview: XlsxPreview,
): { sheetName: string; address: string } | null {
  const trimmed = target.trim();
  if (!trimmed) return null;

  const separatorIndex = preview.sheets.length > 1 ? trimmed.indexOf("!") : -1;
  if (separatorIndex >= 0) {
    const sheetName = trimmed.slice(0, separatorIndex);
    const address = trimmed.slice(separatorIndex + 1);
    return sheetName && address ? { sheetName, address } : null;
  }

  const firstSheet = preview.sheets[0];
  return firstSheet ? { sheetName: firstSheet.name, address: trimmed } : null;
}

function findXlsxPreviewCell(
  preview: TemplatePreview | null,
  target: string,
): XlsxPreviewCell | null {
  if (!isXlsxPreview(preview)) return null;
  const parsed = splitXlsxTarget(target, preview);
  if (!parsed) return null;

  const sheet = preview.sheets.find((item) => item.name === parsed.sheetName);
  if (!sheet) return null;

  for (const row of sheet.rows) {
    const cell = row.cells.find((item) => item.address === parsed.address);
    if (cell) return cell;
  }

  return null;
}

function isAutoLabel(label: string, oldFieldPath: string, placeholder: string) {
  const trimmed = label.trim();
  if (!trimmed) return true;
  return (
    trimmed === oldFieldPath || trimmed === placeholder || trimmed === fieldLabel(oldFieldPath)
  );
}

function initialLabel(mapping: TemplateMappingRow) {
  const label = mapping.label?.trim() ?? "";
  if (!label || label === mapping.field_path || label === mapping.placeholder) {
    return fieldLabel(mapping.field_path);
  }
  return label;
}

function canonicalClientFieldPath(path: string) {
  return suggestFieldEntry(path)?.path ?? path.trim();
}

function confidenceLabel(confidence: number) {
  return `${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%`;
}

function PreviewPanel({
  preview,
  previewError,
  rows,
  activeTarget,
  onSelectTarget,
}: {
  preview: TemplatePreview | null;
  previewError: string | null;
  rows: MappingRow[];
  activeTarget: string;
  onSelectTarget: (target: string) => void;
}) {
  const [sheetIndex, setSheetIndex] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!preview || preview.fileType !== "xlsx") return;
    const match = activeTarget.match(/^([^!]+)!(.+)$/);
    if (!match?.[1]) return;
    const nextSheetIndex = preview.sheets.findIndex((sheet) => sheet.name === match[1]);
    if (nextSheetIndex >= 0 && nextSheetIndex !== sheetIndex) {
      setSheetIndex(nextSheetIndex);
    }
  }, [activeTarget, preview, sheetIndex]);

  useEffect(() => {
    if (!activeTarget || !gridRef.current) return;
    const target = gridRef.current.querySelector<HTMLElement>(
      `[data-cell-target="${CSS.escape(activeTarget)}"]`,
    );
    if (!target) return;

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "center", inline: "center" });
    });
  }, [activeTarget, sheetIndex]);

  if (previewError) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-white">
        <PanelHeader
          icon={<ClipboardCheck size={15} aria-hidden="true" />}
          title="プレビュー"
          description="テンプレートファイルの読み込みに失敗しました。"
          right={<Badge tone="danger">取得失敗</Badge>}
        />
        <div className="p-m text-s text-danger">{previewError}</div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-white">
        <PanelHeader
          icon={<ClipboardCheck size={15} aria-hidden="true" />}
          title="プレビュー"
          description="テンプレートファイルのプレビューを作成できませんでした。"
          right={<Badge tone="neutral">未表示</Badge>}
        />
      </div>
    );
  }

  if (preview.fileType === "xlsx") {
    const activeSheet = preview.sheets[sheetIndex] ?? preview.sheets[0];

    return (
      <div className="flex h-full min-h-0 flex-col bg-white">
        <PanelHeader
          icon={<FileSpreadsheet size={15} aria-hidden="true" />}
          title="Excel プレビュー"
          description="セルをクリックすると、中央の選択中マッピングに入ります。"
          right={
            <div className="flex items-center gap-xs">
              <Badge tone="info">
                <span className="tabular-nums">{preview.sheets.length}</span> シート
              </Badge>
              {preview.truncated && <Badge tone="warning">一部表示</Badge>}
            </div>
          }
        />

        {preview.sheets.length > 1 && (
          <div className="flex shrink-0 gap-xs overflow-x-auto border-b border-border bg-white px-m py-xs">
            {preview.sheets.map((sheet, index) => (
              <button
                key={sheet.name}
                type="button"
                onClick={() => setSheetIndex(index)}
                aria-pressed={index === sheetIndex}
                className={cn(
                  "h-7 shrink-0 rounded-s border px-s text-xs leading-none",
                  index === sheetIndex
                    ? "border-main bg-main-soft text-main"
                    : "border-border bg-white text-text-grey hover:bg-grey-7",
                )}
              >
                {sheet.name}
              </button>
            ))}
          </div>
        )}

        {!activeSheet ? (
          <div className="p-m text-s text-text-grey">表示できるシートがありません。</div>
        ) : (
          <div ref={gridRef} className="min-h-0 flex-1 overflow-auto bg-grey-5">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 h-7 min-w-10 border-b border-r border-border bg-head" />
                  {activeSheet.columns.map((column) => (
                    <th
                      key={column}
                      className="sticky top-0 z-20 h-7 min-w-[120px] border-b border-r border-border bg-head px-xs text-center font-semibold text-text-grey tabular-nums"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeSheet.rows.map((row) => (
                  <tr key={row.number}>
                    <th className="sticky left-0 z-10 h-9 min-w-10 border-b border-r border-border bg-head px-xs text-right font-semibold text-text-grey tabular-nums">
                      {row.number}
                    </th>
                    {row.cells.map((cell) => {
                      const target = mappingTargetForCell(
                        activeSheet.name,
                        preview.sheets.length,
                        cell.address,
                      );
                      const mapped = findMappingByTarget(rows, target);
                      const isActive =
                        normalizePlaceholder(activeTarget) === normalizePlaceholder(target);

                      return (
                        <td
                          key={`${row.number}-${cell.col}`}
                          className="h-9 min-w-[120px] border-b border-r border-border bg-white p-0"
                        >
                          <button
                            type="button"
                            onClick={() => onSelectTarget(target)}
                            aria-label={target}
                            aria-pressed={isActive}
                            data-cell-target={target}
                            title={`${target}${cell.value ? ` / ${cell.value}` : ""}`}
                            className={cn(
                              "block h-9 w-full px-xs py-xxs text-left transition-colors hover:bg-main-soft",
                              mapped && "bg-success-soft text-success",
                              isActive && "bg-main-soft font-medium text-main",
                              !mapped && !isActive && cell.value && "text-text-black",
                              !mapped && !isActive && !cell.value && "text-text-quaternary",
                            )}
                          >
                            <span className="block truncate">
                              {cell.value || (isActive || mapped ? target : " ")}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <PanelHeader
        icon={<FileText size={15} aria-hidden="true" />}
        title="Word プレビュー"
        description="差し込み名をクリックすると、中央の選択中マッピングに入ります。"
        right={
          <div className="flex items-center gap-xs">
            <Badge tone={preview.placeholders.length > 0 ? "info" : "warning"}>
              差し込み <span className="tabular-nums">{preview.placeholders.length}</span> 件
            </Badge>
            {preview.truncated && <Badge tone="warning">一部表示</Badge>}
          </div>
        }
      />

      {preview.blocks.length === 0 ? (
        <div className="p-m text-s text-text-grey">Word 内に選択できる差し込み名がありません。</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto bg-grey-5 px-xl py-l">
          <div className="mx-auto max-w-[880px] rounded-s border border-border bg-white p-l shadow-s">
            <div className="flex flex-col gap-s">
              {preview.blocks.map((block) => (
                <p key={block.id} className="text-s leading-8 text-text-black">
                  {block.parts.map((part, index) => {
                    if (part.type === "text") return <span key={index}>{part.text}</span>;

                    const mapped = findMappingByTarget(rows, part.key);
                    const isActive =
                      normalizePlaceholder(activeTarget) === normalizePlaceholder(part.key);
                    return (
                      <button
                        key={`${part.key}-${index}`}
                        type="button"
                        onClick={() => onSelectTarget(part.key)}
                        aria-pressed={isActive}
                        className={cn(
                          "mx-xxs inline-flex min-h-6 max-w-full items-center rounded-s border px-xs align-middle text-xs transition-colors",
                          mapped
                            ? "border-success bg-success-soft text-success"
                            : "border-main bg-main-soft text-main hover:bg-white",
                          isActive && "font-medium",
                        )}
                        title={`{${part.key}}`}
                      >
                        <span className="break-all">{part.key}</span>
                      </button>
                    );
                  })}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelHeader({
  icon,
  title,
  description,
  right,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-s border-b border-border bg-white px-m py-s">
      <div className="flex min-w-0 items-center gap-s">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-s bg-grey-7 text-text-grey">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-s font-semibold text-text-black">{title}</p>
          {description && <p className="truncate text-xs text-text-grey">{description}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function FieldDictionary({
  fieldQuery,
  setFieldQuery,
  filteredGroups,
  fieldCount,
  activeRowNumber,
  onSelectField,
  onClose,
}: {
  fieldQuery: string;
  setFieldQuery: (value: string) => void;
  filteredGroups: { group: string; fields: FieldEntry[] }[];
  fieldCount: number;
  activeRowNumber: number | null;
  onSelectField: (field: FieldEntry) => void;
  onClose?: () => void;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col bg-white" aria-label="フィールド辞書">
      <PanelHeader
        icon={<Search size={15} aria-hidden="true" />}
        title="フィールド辞書"
        description={
          activeRowNumber
            ? `No.${activeRowNumber} に入れる情報を選びます。`
            : "先にプレビューで転記場所を選びます。"
        }
        right={
          <div className="flex items-center gap-xs">
            <Badge tone="neutral">
              <span className="tabular-nums">{fieldCount}</span> 件
            </Badge>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-s text-text-grey hover:bg-grey-7"
                aria-label="フィールド辞書を閉じる"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        }
      />

      <div className="shrink-0 border-b border-border px-m py-s">
        <Input
          value={fieldQuery}
          onChange={(e) => setFieldQuery(e.target.value)}
          placeholder="氏名、住所、caseNumber..."
          aria-label="フィールドを検索"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-m py-s">
        {filteredGroups.length === 0 ? (
          <p className="text-s text-text-grey">一致するフィールドがありません。</p>
        ) : (
          <div className="flex flex-col gap-m">
            {filteredGroups.map(({ group, fields }) => (
              <section key={group} className="flex flex-col gap-xs">
                <p className="text-xs font-semibold text-text-grey">{group}</p>
                <div className="flex flex-col gap-xxs">
                  {fields.map((field) => (
                    <button
                      key={field.path}
                      type="button"
                      onClick={() => onSelectField(field)}
                      className="rounded-s border border-border bg-white px-s py-xs text-left transition-colors hover:border-main hover:bg-main-soft"
                    >
                      <span className="block text-s leading-tight text-text-black">
                        {field.label}
                      </span>
                      <span className="mt-xxs block break-all text-xxs leading-tight text-text-grey">
                        {field.path}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function AiSuggestionPanel({
  suggestion,
  suggestionError,
  suggesting,
  highConfidenceCount,
  isCandidateAdopted,
  onCreateSuggestions,
  onApplyCandidate,
  onApplyHighConfidence,
}: {
  suggestion: TemplateMappingSuggestion | null;
  suggestionError: string | null;
  suggesting: boolean;
  highConfidenceCount: number;
  isCandidateAdopted: (candidate: TemplateMappingCandidate) => boolean;
  onCreateSuggestions: () => void;
  onApplyCandidate: (candidate: TemplateMappingCandidate) => void;
  onApplyHighConfidence: () => void;
}) {
  const candidates = suggestion?.candidates ?? [];
  const hasCandidates = candidates.length > 0;

  return (
    <div className="shrink-0 border-b border-border bg-white p-m">
      <div className="flex flex-wrap items-start justify-between gap-s">
        <div className="min-w-0">
          <div className="flex items-center gap-xs">
            <p className="text-s font-semibold text-text-black">AIマッピング候補</p>
            {suggestion && (
              <Badge tone="info">
                <span className="tabular-nums">{suggestion.candidates.length}</span> 件
              </Badge>
            )}
          </div>
          <p className="mt-xxs text-xs text-text-grey">
            候補の採用だけでは保存されません。最後に「保存する」で確定します。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-xs">
          {hasCandidates && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onApplyHighConfidence}
              disabled={suggesting || highConfidenceCount === 0}
            >
              高信頼度だけ一括採用
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={onCreateSuggestions}
            loading={suggesting}
            loadingLabel="作成中..."
          >
            AIで候補作成
          </Button>
        </div>
      </div>

      {suggestionError && (
        <div className="mt-s flex items-start gap-xs rounded-s border border-danger bg-danger-soft p-s text-s text-danger">
          <AlertCircle size={14} className="mt-xxs shrink-0" aria-hidden="true" />
          <span>{suggestionError}</span>
        </div>
      )}

      {suggesting && (
        <div className="mt-s rounded-s border border-border bg-grey-5 p-s text-s text-text-grey">
          AIがプレビューと辞書から候補を作成しています。
        </div>
      )}

      {suggestion && suggestion.warnings.length > 0 && (
        <div className="mt-s rounded-s border border-warning bg-warning-soft p-s">
          <div className="flex items-center gap-xs text-s font-semibold text-warning">
            <AlertCircle size={14} aria-hidden="true" />
            注意
          </div>
          <ul className="mt-xs flex flex-col gap-xxs text-xs leading-relaxed text-text-black">
            {suggestion.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {suggestion && suggestion.candidates.length === 0 && !suggesting && (
        <div className="mt-s rounded-s border border-border bg-grey-5 p-s text-s text-text-grey">
          AI候補は見つかりませんでした。プレビュー上の文字や既存マッピングを確認してください。
        </div>
      )}

      {hasCandidates && (
        <div className="mt-s max-h-72 overflow-y-auto pr-xxs">
          <div className="flex flex-col gap-xs">
            {candidates.map((candidate, index) => {
              const adopted = isCandidateAdopted(candidate);
              const knownField = suggestFieldEntry(candidate.fieldPath);
              const caution = candidate.warning || !knownField;

              return (
                <div
                  key={`${candidate.placeholder}-${candidate.fieldPath}-${index}`}
                  className={cn(
                    "rounded-s border bg-white p-s",
                    caution ? "border-warning" : "border-border",
                  )}
                >
                  <div className="flex items-start justify-between gap-s">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-xs">
                        <Badge
                          tone={
                            candidate.confidence >= HIGH_CONFIDENCE_THRESHOLD
                              ? "success"
                              : "neutral"
                          }
                        >
                          信頼度{" "}
                          <span className="tabular-nums">
                            {confidenceLabel(candidate.confidence)}
                          </span>
                        </Badge>
                        {caution && <Badge tone="warning">確認あり</Badge>}
                        {adopted && <Badge tone="success">採用済み</Badge>}
                      </div>
                      <p className="mt-xs break-all text-s text-text-black">
                        {candidate.placeholder}
                      </p>
                      <p className="mt-xxs text-s text-text-black">
                        {knownField?.label ?? candidate.label}
                      </p>
                      <p className="break-all text-xxs text-text-grey">{candidate.fieldPath}</p>
                    </div>

                    <Button
                      variant={adopted ? "secondary" : "primary"}
                      size="sm"
                      onClick={() => onApplyCandidate(candidate)}
                      disabled={adopted}
                    >
                      {adopted ? "採用済み" : "採用"}
                    </Button>
                  </div>

                  <p className="mt-xs text-xs leading-relaxed text-text-grey">{candidate.reason}</p>
                  {candidate.warning && (
                    <p className="mt-xs flex items-start gap-xxs text-xs leading-relaxed text-warning">
                      <AlertCircle size={12} className="mt-xxs shrink-0" aria-hidden="true" />
                      <span>{candidate.warning}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MappingRowList({
  rows,
  rowSummaries,
  activeRowIndex,
  guide,
  onSelect,
  onRemove,
}: {
  rows: MappingRow[];
  rowSummaries: MappingRowSummary[];
  activeRowIndex: number | null;
  guide: ReturnType<typeof fileTypeGuide>;
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-s border border-dashed border-border bg-white p-m text-center text-s text-text-grey">
        マッピング行がありません。
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-s">
      <thead className="sticky top-0 z-10 bg-head">
        <tr className="border-b border-border">
          <th className="w-14 px-s py-xs text-left text-xs font-semibold text-text-grey">状態</th>
          <th className="w-10 px-xs py-xs text-right text-xs font-semibold text-text-grey">No.</th>
          <th className="px-s py-xs text-left text-xs font-semibold text-text-grey">
            {guide.placeholderLabel}
          </th>
          <th className="px-s py-xs text-left text-xs font-semibold text-text-grey">フィールド</th>
          <th className="w-9 px-xs py-xs" aria-label="操作" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const summary = rowSummaries[index];
          const status = summary?.status ?? "needsInput";
          const badge = rowStatusBadge(status);
          const isActive = activeRowIndex === index;

          return (
            <tr
              key={`${row.id ?? "new"}-${index}`}
              data-selected={isActive || undefined}
              className={cn(
                "border-b border-border align-middle",
                isActive ? "bg-main-soft" : "hover:bg-grey-7",
              )}
            >
              <td className="px-s py-xs">
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </td>
              <td className="px-xs py-xs text-right text-xs text-text-grey tabular-nums">
                {index + 1}
              </td>
              <td className="max-w-0 px-s py-xs">
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  aria-pressed={isActive}
                  className="block w-full truncate text-left text-s text-text-black hover:text-main"
                >
                  {row.placeholder || (
                    <span className="text-text-quaternary">{guide.placeholderLabel}</span>
                  )}
                </button>
              </td>
              <td className="max-w-0 px-s py-xs">
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  aria-pressed={isActive}
                  className="block w-full truncate text-left text-xs text-text-grey hover:text-main"
                >
                  {summary?.matchedField?.label || row.fieldPath || (
                    <span className="text-text-quaternary">フィールド未選択</span>
                  )}
                </button>
              </td>
              <td className="px-xs py-xs">
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-s text-text-grey hover:bg-danger-soft hover:text-danger"
                  aria-label={`No.${index + 1}の行を削除`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function MappingEditor({
  templateId,
  templateName,
  templateMeta,
  backHref,
  initialMappings,
  fileType,
  initialPreview,
  initialPreviewError,
}: Props) {
  const toast = useToast();
  const [rows, setRows] = useState<MappingRow[]>(
    initialMappings.map((m) => ({
      id: m.id,
      placeholder: m.placeholder,
      fieldPath: m.field_path,
      label: initialLabel(m),
      isRequired: m.is_required ?? false,
    })),
  );
  const [submitting, setSubmitting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<TemplateMappingSuggestion | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [fieldQuery, setFieldQuery] = useState("");
  const [dictOpen, setDictOpen] = useState(false);
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(
    initialMappings.length > 0 ? 0 : null,
  );
  const deferredFieldQuery = useDeferredValue(fieldQuery);
  const guide = fileTypeGuide(fileType);
  const GuideIcon = guide.icon;

  const filteredGroups = useMemo(
    () =>
      FIELD_GROUPS.map(({ group, fields }) => {
        const query = deferredFieldQuery.trim().toLowerCase();
        if (!query) return { group, fields };
        return {
          group,
          fields: fields.filter((field) =>
            [field.label, field.path, ...(field.aliases ?? [])]
              .join(" ")
              .toLowerCase()
              .includes(query),
          ),
        };
      }).filter((group) => group.fields.length > 0),
    [deferredFieldQuery],
  );

  const placeholderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = normalizePlaceholder(row.placeholder);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const duplicatePlaceholders = useMemo(
    () =>
      new Set(
        Array.from(placeholderCounts.entries())
          .filter(([, count]) => count > 1)
          .map(([placeholder]) => placeholder),
      ),
    [placeholderCounts],
  );

  const rowSummaries = rows.map((row) => {
    const matchedField = row.fieldPath ? suggestFieldEntry(row.fieldPath) : undefined;
    const isUnknownField = Boolean(row.fieldPath) && !matchedField;
    const isDuplicate = duplicatePlaceholders.has(normalizePlaceholder(row.placeholder));
    const status = rowStatus(row, isUnknownField, isDuplicate);
    return { matchedField, isUnknownField, isDuplicate, status };
  });

  const activeRow = activeRowIndex == null ? null : (rows[activeRowIndex] ?? null);
  const activeSummary = activeRowIndex == null ? null : (rowSummaries[activeRowIndex] ?? null);
  const activeRowNumber = activeRowIndex == null ? null : activeRowIndex + 1;
  const completedCount = rowSummaries.filter((row) => row.status === "complete").length;
  const unresolvedCount = rowSummaries.filter((row) => row.status === "needsInput").length;
  const warningCount = rowSummaries.filter((row) => row.status === "warning").length;
  const requiredCount = rows.filter((row) => row.isRequired).length;
  const fieldCount = filteredGroups.reduce((sum, group) => sum + group.fields.length, 0);
  const progress = rows.length === 0 ? 0 : Math.round((completedCount / rows.length) * 100);
  const adoptedCandidateKeys = useMemo(
    () =>
      new Set(
        rows
          .filter((row) => row.placeholder.trim() && row.fieldPath.trim())
          .map(
            (row) =>
              `${normalizePlaceholder(row.placeholder)}\n${canonicalClientFieldPath(row.fieldPath)}`,
          ),
      ),
    [rows],
  );
  const highConfidenceCandidates = useMemo(() => {
    if (!suggestion) return [];

    const bestByPlaceholder = new Map<string, TemplateMappingCandidate>();
    for (const candidate of suggestion.candidates) {
      if (candidate.confidence < HIGH_CONFIDENCE_THRESHOLD) continue;
      if (candidate.warning) continue;
      if (!suggestFieldEntry(candidate.fieldPath)) continue;
      const key = normalizePlaceholder(candidate.placeholder);
      const current = bestByPlaceholder.get(key);
      if (!current || candidate.confidence > current.confidence) {
        bestByPlaceholder.set(key, candidate);
      }
    }

    return Array.from(bestByPlaceholder.values()).filter(
      (candidate) =>
        !adoptedCandidateKeys.has(
          `${normalizePlaceholder(candidate.placeholder)}\n${canonicalClientFieldPath(candidate.fieldPath)}`,
        ),
    );
  }, [adoptedCandidateKeys, suggestion]);

  function markDirty() {
    setSaved(false);
    setDirty(true);
  }

  function addRow() {
    const nextIndex = rows.length;
    setRows((prev) => [...prev, { placeholder: "", fieldPath: "", label: "", isRequired: false }]);
    setActiveRowIndex(nextIndex);
    markDirty();
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setActiveRowIndex((prev) => {
      if (prev == null) return null;
      if (prev === i) return null;
      return prev > i ? prev - 1 : prev;
    });
    markDirty();
  }

  function updateRow<K extends keyof MappingRow>(i: number, key: K, value: MappingRow[K]) {
    setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
    markDirty();
  }

  function updateFieldPath(i: number, path: string) {
    setRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        const found = suggestFieldEntry(path);
        return {
          ...row,
          fieldPath: path,
          label:
            found && isAutoLabel(row.label, row.fieldPath, row.placeholder)
              ? found.label
              : row.label,
        };
      }),
    );
    markDirty();
  }

  function applyFieldToRow(field: FieldEntry) {
    const firstUnmappedIndex = rows.findIndex((row) => !row.fieldPath.trim());
    const targetIndex =
      activeRowIndex ?? (firstUnmappedIndex >= 0 ? firstUnmappedIndex : rows.length);

    if (targetIndex >= rows.length) {
      setRows((prev) => [
        ...prev,
        { placeholder: "", fieldPath: field.path, label: field.label, isRequired: false },
      ]);
    } else {
      setRows((prev) =>
        prev.map((row, index) =>
          index === targetIndex
            ? {
                ...row,
                fieldPath: field.path,
                label: isAutoLabel(row.label, row.fieldPath, row.placeholder)
                  ? field.label
                  : row.label,
              }
            : row,
        ),
      );
    }

    setActiveRowIndex(targetIndex);
    markDirty();
  }

  function applyPreviewTarget(target: string) {
    const placeholder = target.trim();
    if (!placeholder) return;

    const existingIndex = rows.findIndex(
      (row) => normalizePlaceholder(row.placeholder) === normalizePlaceholder(placeholder),
    );
    if (existingIndex >= 0) {
      setActiveRowIndex(existingIndex);
      return;
    }

    const currentActive = activeRowIndex == null ? undefined : rows[activeRowIndex];
    const firstEmptyIndex = rows.findIndex(
      (row) => !row.placeholder.trim() && !row.fieldPath.trim() && !row.label.trim(),
    );
    const targetIndex =
      activeRowIndex != null && currentActive && !currentActive.placeholder.trim()
        ? activeRowIndex
        : firstEmptyIndex >= 0
          ? firstEmptyIndex
          : rows.length;
    const suggested = suggestFieldEntry(placeholder);

    if (targetIndex >= rows.length) {
      setRows((prev) => [
        ...prev,
        {
          placeholder,
          fieldPath: suggested?.path ?? "",
          label: suggested?.label ?? "",
          isRequired: false,
        },
      ]);
    } else {
      setRows((prev) =>
        prev.map((row, index) =>
          index === targetIndex
            ? {
                ...row,
                placeholder,
                fieldPath: row.fieldPath || suggested?.path || "",
                label: row.label || suggested?.label || "",
              }
            : row,
        ),
      );
    }

    setActiveRowIndex(targetIndex);
    markDirty();
  }

  function autoFillRows() {
    setRows((prev) =>
      prev.map((row) => {
        const suggested = suggestFieldEntry(row.fieldPath || row.placeholder);
        if (!suggested) return row;
        return {
          ...row,
          fieldPath: suggested.path,
          label: isAutoLabel(row.label, row.fieldPath, row.placeholder)
            ? suggested.label
            : row.label,
        };
      }),
    );
    markDirty();
  }

  function removeEmptyRows() {
    setRows((prev) =>
      prev.filter((row) => row.placeholder.trim() || row.fieldPath.trim() || row.label.trim()),
    );
    setActiveRowIndex(null);
    markDirty();
  }

  function rowFromCandidate(candidate: TemplateMappingCandidate, current?: MappingRow): MappingRow {
    const found = suggestFieldEntry(candidate.fieldPath);
    const fieldPath = found?.path ?? candidate.fieldPath.trim();
    return {
      ...current,
      placeholder: candidate.placeholder.trim(),
      fieldPath,
      label: candidate.label.trim() || found?.label || fieldLabel(fieldPath),
      isRequired: current?.isRequired ?? false,
    };
  }

  function applyCandidateToRows(
    currentRows: MappingRow[],
    candidate: TemplateMappingCandidate,
  ): { nextRows: MappingRow[]; appliedIndex: number } {
    const placeholder = normalizePlaceholder(candidate.placeholder);
    const existingIndex = currentRows.findIndex(
      (row) => normalizePlaceholder(row.placeholder) === placeholder,
    );
    if (existingIndex >= 0) {
      return {
        nextRows: currentRows.map((row, index) =>
          index === existingIndex ? rowFromCandidate(candidate, row) : row,
        ),
        appliedIndex: existingIndex,
      };
    }

    const emptyIndex = currentRows.findIndex(
      (row) => !row.placeholder.trim() && !row.fieldPath.trim() && !row.label.trim(),
    );
    if (emptyIndex >= 0) {
      return {
        nextRows: currentRows.map((row, index) =>
          index === emptyIndex ? rowFromCandidate(candidate, row) : row,
        ),
        appliedIndex: emptyIndex,
      };
    }

    return {
      nextRows: [...currentRows, rowFromCandidate(candidate)],
      appliedIndex: currentRows.length,
    };
  }

  function isCandidateAdopted(candidate: TemplateMappingCandidate) {
    return adoptedCandidateKeys.has(
      `${normalizePlaceholder(candidate.placeholder)}\n${canonicalClientFieldPath(candidate.fieldPath)}`,
    );
  }

  async function handleSuggestMappings() {
    setSuggestionError(null);
    setError(null);
    setSuggesting(true);

    try {
      const result = await suggestTemplateMappings(templateId);
      if (!result.ok) {
        setSuggestionError(result.error);
        return;
      }
      setSuggestion(result.data);
    } finally {
      setSuggesting(false);
    }
  }

  function applyCandidate(candidate: TemplateMappingCandidate) {
    const applied = applyCandidateToRows(rows, candidate);
    setRows(applied.nextRows);
    setActiveRowIndex(applied.appliedIndex);
    markDirty();
    setError(null);
  }

  function applyHighConfidenceCandidates() {
    if (highConfidenceCandidates.length === 0) return;

    let nextRows = rows;
    let firstAppliedIndex: number | null = null;
    for (const candidate of highConfidenceCandidates) {
      const applied = applyCandidateToRows(nextRows, candidate);
      nextRows = applied.nextRows;
      firstAppliedIndex ??= applied.appliedIndex;
    }

    setRows(nextRows);
    setActiveRowIndex(firstAppliedIndex);
    markDirty();
    setError(null);
  }

  async function handleSave() {
    setError(null);
    setSaved(false);

    const incompleteRows = rows.filter((row) => !row.placeholder.trim() || !row.fieldPath.trim());
    if (incompleteRows.length > 0) {
      setError("未入力の行があります。転記先とフィールドがそろっているか確認してください。");
      return;
    }

    if (duplicatePlaceholders.size > 0) {
      setError("同じ転記先が複数あります。重複している行を整理してください。");
      return;
    }

    setSubmitting(true);
    try {
      const result = await upsertMappings(
        templateId,
        rows.map((row) => ({
          ...row,
          placeholder: row.placeholder.trim(),
          fieldPath: row.fieldPath.trim(),
          label: row.label.trim(),
        })),
      );
      if (!result.ok) {
        setError(result.error);
        toast({ message: result.error, tone: "danger" });
        return;
      }
      setSaved(true);
      setDirty(false);
      toast({ message: "マッピングを保存しました。", tone: "success" });
    } finally {
      setSubmitting(false);
    }
  }

  if (fileType === "xlsx") {
    const selectedCell = activeRow
      ? findXlsxPreviewCell(initialPreview, activeRow.placeholder)
      : null;
    const activeBadge = rowStatusBadge(activeSummary?.status ?? "needsInput");

    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <header className="shrink-0 border-b border-border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-s px-m py-s">
            <div className="flex min-w-0 items-center gap-s">
              <Link
                href={backHref}
                className="inline-flex h-8 shrink-0 items-center gap-xs rounded-s border border-border bg-white px-s text-s text-text-black hover:bg-grey-7"
              >
                <ChevronLeft size={15} aria-hidden="true" />
                詳細
              </Link>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-s bg-main-soft text-main">
                <FileSpreadsheet size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-l font-semibold leading-tight text-text-black">
                  {templateName}
                </h1>
                <p className="truncate text-xs text-text-grey">Excel マッピング / {templateMeta}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-xs">
              <Badge tone={unresolvedCount > 0 ? "danger" : "success"}>
                未設定 <span className="tabular-nums">{unresolvedCount}</span>
              </Badge>
              <Badge tone={warningCount > 0 ? "warning" : "neutral"}>
                確認 <span className="tabular-nums">{warningCount}</span>
              </Badge>
              <Badge tone="neutral">
                必須 <span className="tabular-nums">{requiredCount}</span>
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-m border-t border-border px-m py-xs">
            <div className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-grey-7">
              <div
                className="h-full rounded-full bg-main transition-[width]"
                style={{ width: `${progress}%` }}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="マッピング完了率"
              />
            </div>
            <p className="shrink-0 text-xs text-text-grey tabular-nums">
              {completedCount} / {rows.length} 件完了（{progress}%）
            </p>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto bg-background lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:overflow-hidden">
          <section className="min-h-96 min-w-0 overflow-hidden border-b border-border lg:min-h-0 lg:border-b-0 lg:border-r">
            <PreviewPanel
              preview={initialPreview}
              previewError={initialPreviewError}
              rows={rows}
              activeTarget={activeRow?.placeholder ?? ""}
              onSelectTarget={applyPreviewTarget}
            />
          </section>

          <aside className="flex min-w-0 flex-col overflow-visible border-b border-border bg-white lg:min-h-0 lg:overflow-hidden lg:border-b-0">
            <PanelHeader
              icon={<ClipboardCheck size={15} aria-hidden="true" />}
              title="選択セル"
              description={activeRow?.placeholder || "未選択"}
              right={
                <div className="flex items-center gap-xs">
                  <Badge tone={activeBadge.tone}>{activeBadge.label}</Badge>
                  <button
                    type="button"
                    onClick={() => setDictOpen(true)}
                    className="inline-flex h-7 items-center gap-xs rounded-s border border-border bg-white px-s text-s text-text-black hover:bg-grey-7 lg:hidden"
                  >
                    <BookText size={14} aria-hidden="true" />
                    辞書
                  </button>
                </div>
              }
            />

            <div className="shrink-0 border-b border-border p-m">
              {activeRow && activeRowIndex != null ? (
                <div className="flex flex-col gap-s">
                  <div className="grid grid-cols-2 gap-s rounded-s border border-border bg-grey-5 p-s">
                    <div className="min-w-0">
                      <p className="text-xs text-text-grey">セル</p>
                      <p className="truncate text-s font-semibold text-text-black">
                        {activeRow.placeholder || "未設定"}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-text-grey">値</p>
                      <p className="truncate text-s text-text-black">
                        {selectedCell?.value || "空欄"}
                      </p>
                    </div>
                  </div>

                  <label className="flex flex-col gap-xxs text-xs text-text-grey">
                    セル座標
                    <Input
                      value={activeRow.placeholder}
                      onChange={(e) => updateRow(activeRowIndex, "placeholder", e.target.value)}
                      placeholder={guide.placeholderHint}
                      className="text-s"
                    />
                  </label>

                  <label className="flex flex-col gap-xxs text-xs text-text-grey">
                    フィールド
                    <Input
                      value={activeRow.fieldPath}
                      onChange={(e) => updateFieldPath(activeRowIndex, e.target.value)}
                      onBlur={(e) => {
                        const found = suggestFieldEntry(e.target.value);
                        if (found) updateFieldPath(activeRowIndex, found.path);
                      }}
                      placeholder="フィールド辞書から選択"
                      className="text-s"
                    />
                  </label>

                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-s">
                    <label className="flex min-w-0 flex-col gap-xxs text-xs text-text-grey">
                      表示名
                      <Input
                        value={activeRow.label}
                        onChange={(e) => updateRow(activeRowIndex, "label", e.target.value)}
                        placeholder={fieldLabel(activeRow.fieldPath || activeRow.placeholder)}
                        className="text-s"
                      />
                    </label>

                    <label className="mb-xs inline-flex items-center gap-xs text-xs text-text-grey">
                      <Checkbox
                        checked={activeRow.isRequired}
                        onChange={(e) => updateRow(activeRowIndex, "isRequired", e.target.checked)}
                      />
                      必須
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-xs">
                    {activeSummary?.matchedField && (
                      <Badge tone="info">{activeSummary.matchedField.label}</Badge>
                    )}
                    {activeSummary?.isDuplicate && (
                      <span className="flex items-center gap-xxs text-xs text-danger">
                        <AlertCircle size={12} aria-hidden="true" />
                        同じセルがあります
                      </span>
                    )}
                    {activeSummary?.isUnknownField && (
                      <span className="flex items-center gap-xxs text-xs text-warning">
                        <AlertCircle size={12} aria-hidden="true" />
                        辞書未登録のパスです
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-s border border-dashed border-border bg-grey-5 p-m text-s text-text-grey">
                  選択セルはありません。
                </div>
              )}
            </div>

            <AiSuggestionPanel
              suggestion={suggestion}
              suggestionError={suggestionError}
              suggesting={suggesting}
              highConfidenceCount={highConfidenceCandidates.length}
              isCandidateAdopted={isCandidateAdopted}
              onCreateSuggestions={handleSuggestMappings}
              onApplyCandidate={applyCandidate}
              onApplyHighConfidence={applyHighConfidenceCandidates}
            />

            <div className="hidden min-h-0 flex-1 lg:block">
              <FieldDictionary
                fieldQuery={fieldQuery}
                setFieldQuery={setFieldQuery}
                filteredGroups={filteredGroups}
                fieldCount={fieldCount}
                activeRowNumber={activeRowNumber}
                onSelectField={applyFieldToRow}
              />
            </div>
          </aside>

          <section className="flex h-72 min-w-0 flex-col border-t border-border bg-white lg:col-span-2">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-s border-b border-border px-m py-xs">
              <p className="text-xs text-text-grey">
                全<span className="tabular-nums">{rows.length}</span>件
              </p>
              <div className="flex flex-wrap items-center gap-xs">
                <Button variant="secondary" size="sm" onClick={autoFillRows}>
                  <Wand2 size={14} aria-hidden="true" />
                  自動補完
                </Button>
                <Button variant="secondary" size="sm" onClick={removeEmptyRows}>
                  空行整理
                </Button>
                <Button variant="secondary" size="sm" onClick={addRow}>
                  <Plus size={14} aria-hidden="true" />
                  行追加
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <MappingRowList
                rows={rows}
                rowSummaries={rowSummaries}
                activeRowIndex={activeRowIndex}
                guide={guide}
                onSelect={setActiveRowIndex}
                onRemove={removeRow}
              />
            </div>
          </section>
        </div>

        <FieldDictionaryDrawer open={dictOpen} onClose={() => setDictOpen(false)}>
          <FieldDictionary
            fieldQuery={fieldQuery}
            setFieldQuery={setFieldQuery}
            filteredGroups={filteredGroups}
            fieldCount={fieldCount}
            activeRowNumber={activeRowNumber}
            onSelectField={(field) => {
              applyFieldToRow(field);
              setDictOpen(false);
            }}
            onClose={() => setDictOpen(false)}
          />
        </FieldDictionaryDrawer>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-s border-t border-border bg-white px-m py-s pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="flex min-w-0 flex-wrap items-center gap-s text-xs">
            {error ? (
              <span className="flex min-w-0 items-center gap-xxs text-danger">
                <AlertCircle size={13} aria-hidden="true" />
                <span className="truncate">{error}</span>
              </span>
            ) : saved && !dirty ? (
              <span className="flex items-center gap-xxs text-success">
                <CheckCircle2 size={13} aria-hidden="true" />
                保存済み
              </span>
            ) : dirty ? (
              <span className="text-text-grey">未保存の変更があります</span>
            ) : (
              <span className="text-text-grey">変更はありません</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-s">
            <Link
              href={backHref}
              className="inline-flex h-8 shrink-0 items-center rounded-s border border-border bg-white px-m text-s text-text-black hover:bg-grey-7"
            >
              キャンセル
            </Link>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={submitting}
              loadingLabel="保存中..."
            >
              保存する
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-s px-m py-s">
          <div className="flex min-w-0 items-center gap-s">
            <Link
              href={backHref}
              className="inline-flex h-8 shrink-0 items-center gap-xs rounded-s border border-border bg-white px-s text-s text-text-black hover:bg-grey-7"
            >
              <ChevronLeft size={15} aria-hidden="true" />
              詳細
            </Link>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-s bg-main-soft text-main">
              <GuideIcon size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-l font-semibold leading-tight text-text-black">
                {templateName}
              </h1>
              <p className="truncate text-xs text-text-grey">
                {guide.title} / {templateMeta}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-xs">
            <Badge tone={unresolvedCount > 0 ? "danger" : "success"}>
              未設定 <span className="tabular-nums">{unresolvedCount}</span>
            </Badge>
            <Badge tone={warningCount > 0 ? "warning" : "success"}>
              確認 <span className="tabular-nums">{warningCount}</span>
            </Badge>
            <Badge tone="neutral">
              必須 <span className="tabular-nums">{requiredCount}</span>
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-m border-t border-border px-m py-xs">
          <div className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-grey-7">
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                unresolvedCount > 0 || warningCount > 0 ? "bg-warning" : "bg-success",
              )}
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="マッピング完了率"
            />
          </div>
          <p className="shrink-0 text-xs text-text-grey tabular-nums">
            {completedCount} / {rows.length} 件完了（{progress}%）
          </p>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 bg-background lg:grid-cols-[minmax(0,1fr)_minmax(360px,430px)] xl:grid-cols-[minmax(0,1fr)_minmax(360px,430px)_340px]">
        <section className="min-h-[360px] min-w-0 overflow-hidden border-b border-border lg:min-h-0 lg:border-b-0 lg:border-r">
          <PreviewPanel
            preview={initialPreview}
            previewError={initialPreviewError}
            rows={rows}
            activeTarget={activeRow?.placeholder ?? ""}
            onSelectTarget={applyPreviewTarget}
          />
        </section>

        <section className="flex min-h-[420px] min-w-0 flex-col overflow-hidden border-b border-border bg-grey-5 lg:min-h-0 lg:border-b-0 xl:border-r">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-s border-b border-border bg-white px-m py-s">
            <div className="flex min-w-0 items-center gap-s">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-s bg-grey-7 text-text-grey">
                <ClipboardCheck size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-s font-semibold text-text-black">マッピング</p>
                <p className="truncate text-xs text-text-grey">{guide.targetHelp}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-xs">
              {activeRowNumber ? (
                <Badge tone="info">
                  No.<span className="tabular-nums">{activeRowNumber}</span>
                </Badge>
              ) : null}
              <button
                type="button"
                onClick={() => setDictOpen(true)}
                className="inline-flex h-7 items-center gap-xs rounded-s border border-border bg-white px-s text-s text-text-black hover:bg-grey-7 xl:hidden"
              >
                <BookText size={14} aria-hidden="true" />
                辞書
              </button>
            </div>
          </div>

          <AiSuggestionPanel
            suggestion={suggestion}
            suggestionError={suggestionError}
            suggesting={suggesting}
            highConfidenceCount={highConfidenceCandidates.length}
            isCandidateAdopted={isCandidateAdopted}
            onCreateSuggestions={handleSuggestMappings}
            onApplyCandidate={applyCandidate}
            onApplyHighConfidence={applyHighConfidenceCandidates}
          />

          <div className="shrink-0 border-b border-border bg-white p-m">
            {activeRow && activeRowIndex != null ? (
              <div className="flex flex-col gap-s">
                <div className="grid grid-cols-1 gap-s sm:grid-cols-2 xl:grid-cols-1">
                  <label className="flex flex-col gap-xxs text-xs text-text-grey">
                    {guide.placeholderLabel}
                    <Input
                      value={activeRow.placeholder}
                      onChange={(e) => updateRow(activeRowIndex, "placeholder", e.target.value)}
                      onBlur={(e) => {
                        const suggested = suggestFieldEntry(e.target.value);
                        if (!suggested) return;
                        if (!activeRow.fieldPath || activeRow.fieldPath === activeRow.placeholder) {
                          updateFieldPath(activeRowIndex, suggested.path);
                        }
                      }}
                      placeholder={guide.placeholderHint}
                      className="text-s"
                    />
                  </label>

                  <label className="flex flex-col gap-xxs text-xs text-text-grey">
                    フィールド
                    <Input
                      value={activeRow.fieldPath}
                      onChange={(e) => updateFieldPath(activeRowIndex, e.target.value)}
                      onBlur={(e) => {
                        const found = suggestFieldEntry(e.target.value);
                        if (found) updateFieldPath(activeRowIndex, found.path);
                      }}
                      placeholder="右の辞書から選択"
                      className="text-s"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-s">
                  <label className="flex min-w-0 flex-col gap-xxs text-xs text-text-grey">
                    表示名
                    <Input
                      value={activeRow.label}
                      onChange={(e) => updateRow(activeRowIndex, "label", e.target.value)}
                      placeholder={fieldLabel(activeRow.fieldPath || activeRow.placeholder)}
                      className="text-s"
                    />
                  </label>

                  <label className="mb-xs inline-flex items-center gap-xs text-xs text-text-grey">
                    <Checkbox
                      checked={activeRow.isRequired}
                      onChange={(e) => updateRow(activeRowIndex, "isRequired", e.target.checked)}
                    />
                    必須
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-xs">
                  <Badge tone={rowStatusBadge(activeSummary?.status ?? "needsInput").tone}>
                    {rowStatusBadge(activeSummary?.status ?? "needsInput").label}
                  </Badge>
                  <span className="text-xs text-text-grey">
                    {activeSummary?.matchedField?.label ?? "辞書未選択"}
                  </span>
                  {activeSummary?.isDuplicate && (
                    <span className="flex items-center gap-xxs text-xs text-danger">
                      <AlertCircle size={12} aria-hidden="true" />
                      同じ転記先があります
                    </span>
                  )}
                  {activeSummary?.isUnknownField && (
                    <span className="flex items-center gap-xxs text-xs text-warning">
                      <AlertCircle size={12} aria-hidden="true" />
                      辞書未登録のパスです
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-s border border-dashed border-border bg-grey-5 p-m text-s text-text-grey">
                左のプレビューで転記場所をクリックするか、行追加を押してください。
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-s border-b border-border bg-white px-m py-xs">
            <p className="text-xs text-text-grey">
              全<span className="tabular-nums">{rows.length}</span>件
            </p>
            <div className="flex flex-wrap items-center gap-xs">
              <Button variant="secondary" size="sm" onClick={autoFillRows}>
                <Wand2 size={14} aria-hidden="true" />
                自動補完
              </Button>
              <Button variant="secondary" size="sm" onClick={removeEmptyRows}>
                空行整理
              </Button>
              <Button variant="secondary" size="sm" onClick={addRow}>
                <Plus size={14} aria-hidden="true" />
                行追加
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-white">
            <MappingRowList
              rows={rows}
              rowSummaries={rowSummaries}
              activeRowIndex={activeRowIndex}
              guide={guide}
              onSelect={setActiveRowIndex}
              onRemove={removeRow}
            />
          </div>
        </section>

        <section className="hidden min-w-0 overflow-hidden xl:block">
          <FieldDictionary
            fieldQuery={fieldQuery}
            setFieldQuery={setFieldQuery}
            filteredGroups={filteredGroups}
            fieldCount={fieldCount}
            activeRowNumber={activeRowNumber}
            onSelectField={applyFieldToRow}
          />
        </section>
      </div>

      <FieldDictionaryDrawer open={dictOpen} onClose={() => setDictOpen(false)}>
        <FieldDictionary
          fieldQuery={fieldQuery}
          setFieldQuery={setFieldQuery}
          filteredGroups={filteredGroups}
          fieldCount={fieldCount}
          activeRowNumber={activeRowNumber}
          onSelectField={(field) => {
            applyFieldToRow(field);
            setDictOpen(false);
          }}
          onClose={() => setDictOpen(false)}
        />
      </FieldDictionaryDrawer>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-s border-t border-border bg-white px-m py-s pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex min-w-0 flex-wrap items-center gap-s text-xs">
          {error ? (
            <span className="flex min-w-0 items-center gap-xxs text-danger">
              <AlertCircle size={13} aria-hidden="true" />
              <span className="truncate">{error}</span>
            </span>
          ) : saved && !dirty ? (
            <span className="flex items-center gap-xxs text-success">
              <CheckCircle2 size={13} aria-hidden="true" />
              保存済み
            </span>
          ) : dirty ? (
            <span className="text-text-grey">未保存の変更があります</span>
          ) : (
            <span className="text-text-grey">変更はありません</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-s">
          <Link
            href={backHref}
            className="inline-flex h-8 shrink-0 items-center rounded-s border border-border bg-white px-m text-s text-text-black hover:bg-grey-7"
          >
            キャンセル
          </Link>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={submitting}
            loadingLabel="保存中..."
          >
            保存する
          </Button>
        </div>
      </div>
    </div>
  );
}

function FieldDictionaryDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex justify-end xl:hidden"
      style={{ background: "var(--color-scrim)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="フィールド辞書"
        className="flex h-full w-full max-w-[420px] flex-col bg-white shadow-m"
      >
        {children}
      </div>
    </div>
  );
}
