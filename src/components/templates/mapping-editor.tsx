"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  MousePointer2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
          icon={<ClipboardCheck size={15} />}
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
          icon={<ClipboardCheck size={15} />}
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
          icon={<FileSpreadsheet size={15} />}
          title="Excel プレビュー"
          description="セルをクリックすると、中央の選択中マッピングに入ります。"
          right={
            <div className="flex items-center gap-xs">
              <Badge tone="info">{preview.sheets.length} シート</Badge>
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
                      className="sticky top-0 z-20 h-7 min-w-[120px] border-b border-r border-border bg-head px-xs text-center font-medium text-text-grey"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeSheet.rows.map((row) => (
                  <tr key={row.number}>
                    <th className="sticky left-0 z-10 h-9 min-w-10 border-b border-r border-border bg-head px-xs text-right font-medium text-text-grey">
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
                            data-cell-target={target}
                            title={`${target}${cell.value ? ` / ${cell.value}` : ""}`}
                            className={cn(
                              "block h-9 w-full px-xs py-xxs text-left transition-colors hover:bg-main-soft",
                              mapped && "bg-success-soft text-success",
                              isActive && "bg-main-soft text-main ring-2 ring-inset ring-main",
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
        icon={<FileText size={15} />}
        title="Word プレビュー"
        description="差し込み名をクリックすると、中央の選択中マッピングに入ります。"
        right={
          <div className="flex items-center gap-xs">
            <Badge tone={preview.placeholders.length > 0 ? "info" : "warning"}>
              差し込み {preview.placeholders.length} 件
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
                        className={cn(
                          "mx-xxs inline-flex min-h-6 max-w-full items-center gap-xxs rounded-s border px-xs align-middle font-mono text-xs transition-colors",
                          mapped
                            ? "border-success bg-success-soft text-success"
                            : "border-main bg-main-soft text-main hover:bg-white",
                          isActive && "ring-2 ring-main",
                        )}
                        title={`{${part.key}}`}
                      >
                        <MousePointer2 size={12} />
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
          <p className="truncate text-s font-medium text-text-black">{title}</p>
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
}: {
  fieldQuery: string;
  setFieldQuery: (value: string) => void;
  filteredGroups: { group: string; fields: FieldEntry[] }[];
  fieldCount: number;
  activeRowNumber: number | null;
  onSelectField: (field: FieldEntry) => void;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col bg-white">
      <PanelHeader
        icon={<Search size={15} />}
        title="フィールド辞書"
        description={
          activeRowNumber
            ? `No.${activeRowNumber} に入れる情報を選びます。`
            : "先にプレビューで転記場所を選びます。"
        }
        right={<Badge tone="neutral">{fieldCount} 件</Badge>}
      />

      <div className="shrink-0 border-b border-border px-m py-s">
        <Input
          value={fieldQuery}
          onChange={(e) => setFieldQuery(e.target.value)}
          placeholder="氏名、住所、caseNumber..."
          className="h-8"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-m py-s">
        {filteredGroups.length === 0 ? (
          <p className="text-s text-text-grey">一致するフィールドがありません。</p>
        ) : (
          <div className="flex flex-col gap-m">
            {filteredGroups.map(({ group, fields }) => (
              <section key={group} className="flex flex-col gap-xs">
                <p className="text-xs font-medium text-text-grey">{group}</p>
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
                      <span className="mt-xxs block break-all font-mono text-xxs leading-tight text-text-grey">
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
            <Sparkles size={15} className="text-main" />
            <p className="text-s font-medium text-text-black">AIマッピング候補</p>
            {suggestion && <Badge tone="info">{suggestion.candidates.length} 件</Badge>}
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
            <Sparkles size={14} />
            AIで候補作成
          </Button>
        </div>
      </div>

      {suggestionError && (
        <div className="mt-s flex items-start gap-xs rounded-s border border-danger bg-danger-soft p-s text-s text-danger">
          <AlertCircle size={14} className="mt-xxs shrink-0" />
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
          <div className="flex items-center gap-xs text-s font-medium text-warning">
            <AlertCircle size={14} />
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
                          信頼度 {confidenceLabel(candidate.confidence)}
                        </Badge>
                        {caution && <Badge tone="warning">確認あり</Badge>}
                        {adopted && <Badge tone="success">採用済み</Badge>}
                      </div>
                      <p className="mt-xs break-all font-mono text-s text-text-black">
                        {candidate.placeholder}
                      </p>
                      <p className="mt-xxs text-s text-text-black">
                        {knownField?.label ?? candidate.label}
                      </p>
                      <p className="break-all font-mono text-xxs text-text-grey">
                        {candidate.fieldPath}
                      </p>
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
                      <AlertCircle size={12} className="mt-xxs shrink-0" />
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
  const [fieldQuery, setFieldQuery] = useState("");
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

  function addRow() {
    const nextIndex = rows.length;
    setRows((prev) => [...prev, { placeholder: "", fieldPath: "", label: "", isRequired: false }]);
    setActiveRowIndex(nextIndex);
    setSaved(false);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setActiveRowIndex((prev) => {
      if (prev == null) return null;
      if (prev === i) return null;
      return prev > i ? prev - 1 : prev;
    });
    setSaved(false);
  }

  function updateRow<K extends keyof MappingRow>(i: number, key: K, value: MappingRow[K]) {
    setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
    setSaved(false);
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
    setSaved(false);
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
    setSaved(false);
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
    setSaved(false);
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
    setSaved(false);
  }

  function removeEmptyRows() {
    setRows((prev) =>
      prev.filter((row) => row.placeholder.trim() || row.fieldPath.trim() || row.label.trim()),
    );
    setActiveRowIndex(null);
    setSaved(false);
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
    setSaved(false);
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
    setSaved(false);
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
        return;
      }
      setSaved(true);
    } finally {
      setSubmitting(false);
    }
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
              <ChevronLeft size={15} />
              詳細
            </Link>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-s bg-main-soft text-main">
              <GuideIcon size={16} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-l font-medium leading-tight text-text-black">
                {templateName}
              </h1>
              <p className="truncate text-xs text-text-grey">
                {guide.title} / {templateMeta}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-xs">
            <Badge tone={unresolvedCount > 0 ? "danger" : "success"}>
              未設定 {unresolvedCount}
            </Badge>
            <Badge tone={warningCount > 0 ? "warning" : "success"}>確認 {warningCount}</Badge>
            <Badge tone="neutral">必須 {requiredCount}</Badge>
            <Button variant="secondary" size="sm" onClick={autoFillRows}>
              <Wand2 size={14} />
              自動補完
            </Button>
            <Button variant="secondary" size="sm" onClick={removeEmptyRows}>
              空行整理
            </Button>
            <Button variant="secondary" size="sm" onClick={addRow}>
              <Plus size={14} />
              行追加
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              loading={submitting}
              loadingLabel="保存中..."
            >
              保存する
            </Button>
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
            />
          </div>
          <p className="shrink-0 text-xs text-text-grey">
            {completedCount} / {rows.length} 件完了（{progress}%）
          </p>
          {saved && (
            <p className="flex shrink-0 items-center gap-xxs text-xs text-success">
              <CheckCircle2 size={13} />
              保存済み
            </p>
          )}
          {error && (
            <p className="flex min-w-0 items-center gap-xxs text-xs text-danger">
              <AlertCircle size={13} />
              <span className="truncate">{error}</span>
            </p>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 bg-background xl:grid-cols-[minmax(520px,1fr)_430px_340px]">
        <section className="min-h-[460px] min-w-0 overflow-hidden border-b border-border xl:min-h-0 xl:border-b-0 xl:border-r">
          <PreviewPanel
            preview={initialPreview}
            previewError={initialPreviewError}
            rows={rows}
            activeTarget={activeRow?.placeholder ?? ""}
            onSelectTarget={applyPreviewTarget}
          />
        </section>

        <section className="flex min-h-[460px] min-w-0 flex-col overflow-hidden border-b border-border bg-grey-5 xl:min-h-0 xl:border-b-0 xl:border-r">
          <PanelHeader
            icon={<ClipboardCheck size={15} />}
            title="マッピング"
            description={guide.targetHelp}
            right={activeRowNumber ? <Badge tone="info">No.{activeRowNumber}</Badge> : null}
          />

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
                      className="h-8 text-s"
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
                      className="h-8 text-s"
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
                      className="h-8 text-s"
                    />
                  </label>

                  <label className="mb-xs inline-flex items-center gap-xs text-xs text-text-grey">
                    <input
                      type="checkbox"
                      checked={activeRow.isRequired}
                      onChange={(e) => updateRow(activeRowIndex, "isRequired", e.target.checked)}
                      className="rounded"
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
                      <AlertCircle size={12} />
                      同じ転記先があります
                    </span>
                  )}
                  {activeSummary?.isUnknownField && (
                    <span className="flex items-center gap-xxs text-xs text-warning">
                      <AlertCircle size={12} />
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

          <div className="min-h-0 flex-1 overflow-y-auto p-s">
            {rows.length === 0 ? (
              <div className="rounded-s border border-dashed border-border bg-white p-m text-center text-s text-text-grey">
                マッピング行がありません。
              </div>
            ) : (
              <div className="flex flex-col gap-xs">
                {rows.map((row, index) => {
                  const summary = rowSummaries[index];
                  const status = summary?.status ?? "needsInput";
                  const badge = rowStatusBadge(status);
                  const isActive = activeRowIndex === index;

                  return (
                    <div
                      key={`${row.id ?? "new"}-${index}`}
                      className={cn(
                        "rounded-s border bg-white p-s transition-colors hover:border-main hover:bg-main-soft",
                        isActive ? "border-main ring-2 ring-main/20" : "border-border",
                      )}
                    >
                      <div className="flex items-start justify-between gap-s">
                        <button
                          type="button"
                          onClick={() => setActiveRowIndex(index)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-xs">
                            <Badge tone={badge.tone}>{badge.label}</Badge>
                            <span className="text-xs text-text-grey">No.{index + 1}</span>
                          </div>
                          <p className="mt-xs truncate font-mono text-s text-text-black">
                            {row.placeholder || guide.placeholderLabel}
                          </p>
                          <p className="truncate text-xs text-text-grey">
                            {summary?.matchedField?.label || row.fieldPath || "フィールド未選択"}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeRow(index);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              removeRow(index);
                            }
                          }}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-s text-text-grey hover:bg-danger-soft hover:text-danger"
                          title="行を削除"
                          aria-label={`No.${index + 1}の行を削除`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="min-h-[460px] min-w-0 overflow-hidden xl:min-h-0">
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
    </div>
  );
}
