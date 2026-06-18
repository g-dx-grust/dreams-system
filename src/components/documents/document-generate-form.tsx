"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Files } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  generateCaseDocuments,
  generateDocument,
  type BulkGenerateResult,
  type GeneratedDocumentResult,
} from "@/server/documents";
import { previewTemplateFill } from "@/server/templates";
import type { TemplateGenerationOption } from "@/server/templates";

type Props = {
  caseId: number;
  templates: TemplateGenerationOption[];
  parcelCount: number;
};

export function DocumentGenerateForm({ caseId, templates, parcelCount }: Props) {
  const toast = useToast();
  const [templateId, setTemplateId] = useState<string>("");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>(() =>
    templates.map((template) => template.id),
  );
  const [highlight, setHighlight] = useState(true);
  const hasParcels = parcelCount > 0;
  const [includeParcelAttachment, setIncludeParcelAttachment] = useState(true);
  const parcelAttachmentUrl = `/api/cases/${caseId}/parcels/attachment`;
  const [checking, setChecking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    totalFields: number;
    filledFields: number;
    missingRequired: string[];
    missingOptional: string[];
  } | null>(null);
  const [generated, setGenerated] = useState<GeneratedDocumentResult | null>(null);
  const [bulkGenerated, setBulkGenerated] = useState<BulkGenerateResult | null>(null);

  useEffect(() => {
    setSelectedTemplateIds((current) => {
      const availableIds = new Set(templates.map((template) => template.id));
      const kept = current.filter((id) => availableIds.has(id));
      return kept.length > 0 ? kept : templates.map((template) => template.id);
    });
  }, [templates]);

  const selectedTemplateSet = useMemo(
    () => new Set(selectedTemplateIds),
    [selectedTemplateIds],
  );
  const selectedTemplates = useMemo(
    () => templates.filter((template) => selectedTemplateSet.has(template.id)),
    [selectedTemplateSet, templates],
  );

  function handleToggleTemplate(id: number, checked: boolean) {
    setBulkGenerated(null);
    setError(null);
    setSelectedTemplateIds((current) => {
      if (checked) return Array.from(new Set([...current, id]));
      return current.filter((templateId) => templateId !== id);
    });
  }

  function handleSelectAll() {
    setBulkGenerated(null);
    setError(null);
    setSelectedTemplateIds(templates.map((template) => template.id));
  }

  function handleClearSelection() {
    setBulkGenerated(null);
    setError(null);
    setSelectedTemplateIds([]);
  }

  async function handleCheck() {
    if (!templateId) return;
    setError(null);
    setBulkGenerated(null);
    setChecking(true);
    try {
      const result = await previewTemplateFill(Number(templateId), caseId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview(result.data);
    } finally {
      setChecking(false);
    }
  }

  async function handleGenerate() {
    if (!templateId) return;
    setError(null);
    setBulkGenerated(null);
    setGenerating(true);
    try {
      const result = await generateDocument({
        caseId,
        templateId: Number(templateId),
        highlight,
      });
      if (!result.ok) {
        setError(result.error);
        toast({ message: result.error, tone: "danger" });
        return;
      }
      setGenerated(result.data);
      setPreview(null);
      toast({ message: "帳票を生成しました", tone: "success" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleBulkGenerate() {
    if (selectedTemplateIds.length === 0) return;
    setError(null);
    setGenerated(null);
    setPreview(null);
    setBulkGenerating(true);
    try {
      const result = await generateCaseDocuments({
        caseId,
        templateIds: selectedTemplateIds,
        highlight,
      });
      if (!result.ok) {
        setError(result.error);
        toast({ message: result.error, tone: "danger" });
        return;
      }
      setBulkGenerated(result.data);
      if (result.data.failed.length === 0) {
        toast({ message: `${result.data.generated.length}件の帳票を生成しました`, tone: "success" });
      } else {
        toast({
          message: `${result.data.generated.length}件を生成しました（${result.data.failed.length}件未生成）`,
          tone: "warning",
        });
      }
    } finally {
      setBulkGenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>帳票を生成する</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="flex w-full min-w-0 flex-col gap-m">
          <div className="grid gap-m xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
            <div className="flex min-w-0 flex-col gap-m">
              <Field label="単票生成" required>
                <Select
                  value={templateId}
                  onChange={(e) => {
                    setTemplateId(e.target.value);
                    setPreview(null);
                    setGenerated(null);
                    setBulkGenerated(null);
                    setError(null);
                  }}
                >
                  <option value="">選択してください</option>
                  {templates.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      [{t.category_name}]
                      {t.location_label ? ` [${t.location_label}]` : ""}
                      {" "}
                      {t.name} v{t.version} (.{t.file_type})
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="flex flex-wrap gap-xs">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCheck}
                  loading={checking}
                  disabled={!templateId || generating || bulkGenerating}
                >
                  転記前チェック
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleGenerate}
                  loading={generating}
                  loadingLabel="生成中…"
                  disabled={!templateId || bulkGenerating || (preview?.missingRequired?.length ?? 0) > 0}
                >
                  この帳票を生成する
                </Button>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-s rounded-s border border-border bg-background p-m">
              <div className="flex flex-wrap items-center justify-between gap-s">
                <div className="flex items-center gap-xs">
                  <Files size={16} className="text-main" />
                  <span className="text-s font-medium">
                    一括生成 {selectedTemplates.length} / {templates.length} 件
                  </span>
                </div>
                <div className="flex items-center gap-xs">
                  <Button type="button" variant="text" size="sm" onClick={handleSelectAll}>
                    全選択
                  </Button>
                  <Button type="button" variant="text" size="sm" onClick={handleClearSelection}>
                    解除
                  </Button>
                </div>
              </div>

              {templates.length === 0 ? (
                <p className="text-s text-text-grey">この案件で生成できるテンプレートがありません。</p>
              ) : (
                <div className="max-h-[280px] overflow-y-auto rounded-s border border-border bg-white">
                  {templates.map((template) => (
                    <label
                      key={template.id}
                      className="flex min-w-0 cursor-pointer items-start gap-s border-b border-border px-s py-s last:border-b-0 hover:bg-grey-7"
                    >
                      <Checkbox
                        checked={selectedTemplateSet.has(template.id)}
                        onChange={(e) => handleToggleTemplate(template.id, e.target.checked)}
                        className="mt-[3px]"
                        disabled={bulkGenerating}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-xxs">
                        <span className="flex min-w-0 flex-wrap items-center gap-xs">
                          <Badge tone="info">{template.category_name}</Badge>
                          {template.location_label && (
                            <Badge tone="neutral">{template.location_label}</Badge>
                          )}
                          <Badge tone="neutral">.{template.file_type}</Badge>
                          <span className="min-w-0 truncate font-medium" title={template.name}>
                            {template.name}
                          </span>
                        </span>
                        <span className="text-xs text-text-grey">v{template.version}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <Button
                type="button"
                variant="primary"
                onClick={handleBulkGenerate}
                loading={bulkGenerating}
                loadingLabel="一括生成中…"
                disabled={
                  selectedTemplateIds.length === 0 || checking || generating || templates.length === 0
                }
              >
                選択した帳票を一括生成
              </Button>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-xs text-s">
            <Checkbox checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
            転記箇所をハイライトする
          </label>

          <div className="flex flex-col gap-xs rounded-s border border-border bg-background p-m text-s">
            <div className="flex flex-wrap items-center justify-between gap-s">
              <span className="font-medium">筆別紙（全筆一覧）</span>
              {hasParcels ? (
                <a
                  href={parcelAttachmentUrl}
                  download
                  className="inline-flex h-8 shrink-0 items-center gap-xs whitespace-nowrap rounded-m border border-border bg-white px-s text-s font-medium text-main transition-colors hover:bg-grey-6"
                >
                  <Download size={14} />
                  別紙だけダウンロード
                </a>
              ) : (
                <span className="text-xs text-text-grey">登録された筆がありません。</span>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-xs">
              <Checkbox
                checked={includeParcelAttachment}
                onChange={(e) => setIncludeParcelAttachment(e.target.checked)}
                disabled={!hasParcels}
              />
              一括生成のZIPに筆別紙（全{parcelCount}筆の一覧）を含める
            </label>
          </div>

          {error && (
            <div
              className="rounded-s border border-danger bg-danger-soft p-s text-s text-danger"
              role="alert"
            >
              {error}
            </div>
          )}

          {preview && (
            <div className="rounded bg-background border border-border p-m text-s flex flex-col gap-xs">
              <p className="font-medium">転記前チェック結果</p>
              <p>
                フィールド数：{preview.filledFields} / {preview.totalFields} 件が入力済み
              </p>
              {preview.missingRequired.length > 0 && (
                <div>
                  <p className="text-danger font-medium">必須フィールドが未入力です：</p>
                  <ul className="list-disc list-inside text-danger">
                    {preview.missingRequired.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.missingOptional.length > 0 && (
                <p className="text-text-grey">
                  任意フィールド未入力：{preview.missingOptional.join("、")}
                </p>
              )}
            </div>
          )}

          {generated && (
            <div className="flex flex-col gap-s rounded-s border border-border bg-column p-m text-s sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-xs sm:items-center">
                <FileText size={16} className="text-main" />
                <span className="min-w-0 break-all font-medium">{generated.fileName}</span>
                <Badge tone="success">v{generated.version} 生成完了</Badge>
              </div>
              <a
                href={generated.downloadUrl}
                download={generated.fileName}
                className="inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-m border border-border bg-white px-s text-s font-medium text-main transition-colors hover:bg-grey-6"
              >
                ダウンロード
              </a>
            </div>
          )}

          {bulkGenerated && (
            <div className="flex flex-col gap-s rounded-s border border-border bg-column p-m text-s">
              <div className="flex flex-wrap items-center justify-between gap-s">
                <div className="flex min-w-0 items-center gap-xs">
                  <Files size={16} className="text-main" />
                  <span className="font-medium">
                    {bulkGenerated.generated.length} / {bulkGenerated.total} 件を生成しました
                  </span>
                  {bulkGenerated.failed.length === 0 ? (
                    <Badge tone="success">一括生成完了</Badge>
                  ) : (
                    <Badge tone="warning">一部未生成</Badge>
                  )}
                </div>
                {bulkGenerated.downloadUrl && (
                  <a
                    href={
                      includeParcelAttachment && hasParcels
                        ? `${bulkGenerated.downloadUrl}&besshi=1`
                        : bulkGenerated.downloadUrl
                    }
                    download
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-xs whitespace-nowrap rounded-m border border-border bg-white px-s text-s font-medium text-main transition-colors hover:bg-grey-6"
                  >
                    <Download size={14} />
                    ZIPダウンロード
                  </a>
                )}
              </div>

              <ul className="flex max-h-[160px] flex-col gap-xxs overflow-y-auto border-t border-border pt-s">
                {bulkGenerated.generated.map((document) => (
                  <li key={document.id} className="flex min-w-0 items-center gap-xs text-xs">
                    <Badge tone="success">v{document.version}</Badge>
                    <span className="min-w-0 truncate" title={document.fileName}>
                      {document.fileName}
                    </span>
                  </li>
                ))}
              </ul>

              {bulkGenerated.failed.length > 0 && (
                <div className="border-t border-border pt-s">
                  <p className="font-medium text-warning">生成できなかった帳票</p>
                  <ul className="mt-xs flex flex-col gap-xxs text-xs text-text-grey">
                    {bulkGenerated.failed.map((failure) => (
                      <li key={failure.templateId}>
                        {failure.templateName}: {failure.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

        </div>
      </CardBody>
    </Card>
  );
}
