"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DETAIL_KEY_LABELS: Record<string, string> = {
  after: "変更後",
  before: "変更前",
  caseId: "案件ID",
  documentIds: "帳票履歴ID",
  downloadMode: "ダウンロード種別",
  email: "メールアドレス",
  fileCount: "ファイル数",
  fileName: "ファイル名",
  fileNames: "ファイル名",
  fileType: "ファイル形式",
  includeParcelAttachment: "別紙同梱",
  reason: "理由",
  templateId: "テンプレートID",
  version: "バージョン",
  zipFileName: "ZIPファイル名",
};

const DOWNLOAD_MODE_LABELS: Record<string, string> = {
  single: "単体ダウンロード",
  bulk_zip: "一括ZIP",
};

export function AuditLogDetailDialog({
  detail,
  actionLabel,
  entityLabel,
}: {
  detail: Record<string, unknown> | null;
  actionLabel: string;
  entityLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!detail) return <span className="text-text-grey">—</span>;

  const rows = Object.entries(detail);

  return (
    <>
      <Button type="button" variant="text" size="sm" onClick={() => setOpen(true)}>
        詳細を見る
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-scrim p-m"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-[var(--width-content-max)] flex-col rounded-l border border-border bg-white shadow-m"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-m border-b border-border px-l py-m">
              <div>
                <h2 id={titleId} className="text-l font-semibold text-text-black">
                  監査ログ詳細
                </h2>
                <p className="mt-xs text-s text-text-grey">
                  {actionLabel} / {entityLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="詳細を閉じる"
                className="flex h-8 w-8 items-center justify-center rounded-s text-text-grey hover:bg-grey-7 hover:text-text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-auto p-l">
              {rows.length === 0 ? (
                <p className="text-s text-text-grey">詳細情報はありません。</p>
              ) : (
                <table className="w-full border-collapse text-m">
                  <tbody className="divide-y divide-border">
                    {rows.map(([key, value]) => (
                      <tr key={key}>
                        <th className="w-48 bg-head px-m py-s text-left align-top text-s font-semibold text-text-grey">
                          {DETAIL_KEY_LABELS[key] ?? key}
                        </th>
                        <td className="px-m py-s align-top text-text-black">
                          {renderDetailValue(key, value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex justify-end border-t border-border px-l py-m">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                閉じる
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function renderDetailValue(key: string, value: unknown) {
  if (value == null || value === "") return <span className="text-text-grey">—</span>;
  if (key === "downloadMode" && typeof value === "string") {
    return DOWNLOAD_MODE_LABELS[value] ?? value;
  }
  if (typeof value === "boolean") return value ? "はい" : "いいえ";
  if (typeof value === "number") return <span className="tabular-nums">{value}</span>;
  if (typeof value === "string") return value;
  return (
    <pre className="max-h-72 overflow-auto rounded-s bg-grey-6 p-s text-xs text-text-black">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
