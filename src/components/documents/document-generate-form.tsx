"use client";

import { useState } from "react";
import { Download, FileText, Files } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
};

export function DocumentGenerateForm({ caseId, templates }: Props) {
  const [templateId, setTemplateId] = useState<string>("");
  const [highlight, setHighlight] = useState(true);
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
        return;
      }
      setGenerated(result.data);
      setPreview(null);
    } finally {
      setGenerating(false);
    }
  }

  async function handleBulkGenerate() {
    if (templates.length === 0) return;
    setError(null);
    setGenerated(null);
    setPreview(null);
    setBulkGenerating(true);
    try {
      const result = await generateCaseDocuments({
        caseId,
        highlight,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBulkGenerated(result.data);
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
        <div className="flex w-full max-w-[48rem] min-w-0 flex-col gap-m">
          <Field label="テンプレートを選択" required>
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

          <label className="flex items-center gap-xs text-s cursor-pointer">
            <input
              type="checkbox"
              checked={highlight}
              onChange={(e) => setHighlight(e.target.checked)}
              className="rounded"
            />
            転記箇所をハイライトする
          </label>

          {error && <p className="text-s text-danger">{error}</p>}

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
                    href={bulkGenerated.downloadUrl}
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
              disabled={!templateId || bulkGenerating || (preview?.missingRequired?.length ?? 0) > 0}
            >
              選択した帳票を生成する
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleBulkGenerate}
              loading={bulkGenerating}
              disabled={templates.length === 0 || checking || generating}
            >
              関連帳票をまとめて生成
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
