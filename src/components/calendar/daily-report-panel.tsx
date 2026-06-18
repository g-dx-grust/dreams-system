"use client";

import * as React from "react";
import { MessageSquare, Save, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  createDailyReportComment,
  saveDailyReport,
  submitDailyReport,
  type CalendarDailyReport,
} from "@/server/calendar";

type DailyReportPanelProps = {
  date: string;
  dateLabel: string;
  report: CalendarDailyReport | null;
};

type DailyReportDialogProps = DailyReportPanelProps & {
  open: boolean;
  onClose: () => void;
};

type DailyReportContentProps = DailyReportPanelProps & {
  onClose?: () => void;
  closeButtonRef?: React.Ref<HTMLButtonElement>;
  titleId?: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatCommentDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function DailyReportContent({
  date,
  dateLabel,
  report,
  onClose,
  closeButtonRef,
  titleId,
}: DailyReportContentProps) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = React.useState(report?.body ?? "");
  const [bodyError, setBodyError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [commentBody, setCommentBody] = React.useState("");
  const [commentError, setCommentError] = React.useState<string | null>(null);
  const [isSavePending, startSaveTransition] = React.useTransition();
  const [isSubmitPending, startSubmitTransition] = React.useTransition();
  const [isCommentPending, startCommentTransition] = React.useTransition();

  React.useEffect(() => {
    setBody(report?.body ?? "");
    setBodyError(null);
    setFormError(null);
    setCommentBody("");
    setCommentError(null);
  }, [date, report?.body, report?.id]);

  const statusTone = report?.status === "submitted" ? "success" : "neutral";
  const statusLabel = report?.status === "submitted" ? "提出済み" : "下書き";
  const bodyLength = body.trim().length;

  const onSave = () => {
    setBodyError(null);
    setFormError(null);
    startSaveTransition(async () => {
      try {
        const result = await saveDailyReport({ reportDate: date, body });
        if (result.ok) {
          toast({ message: "日報を保存しました。", tone: "success" });
          router.refresh();
          return;
        }
        if (result.field === "body") setBodyError(result.error);
        else setFormError(result.error);
      } catch {
        setFormError("日報の保存に失敗しました。時間をおいて再度お試しください。");
      }
    });
  };

  const onSubmitReport = () => {
    setBodyError(null);
    setFormError(null);
    startSubmitTransition(async () => {
      try {
        const result = await submitDailyReport({ reportDate: date, body });
        if (result.ok) {
          toast({ message: "日報を提出しました。", tone: "success" });
          router.refresh();
          return;
        }
        if (result.field === "body") setBodyError(result.error);
        else setFormError(result.error);
      } catch {
        setFormError("日報の提出に失敗しました。時間をおいて再度お試しください。");
      }
    });
  };

  const onSubmitComment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!report) return;

    setCommentError(null);
    startCommentTransition(async () => {
      try {
        const result = await createDailyReportComment({
          reportId: report.id,
          body: commentBody,
        });
        if (result.ok) {
          toast({ message: "コメントを投稿しました。", tone: "success" });
          setCommentBody("");
          router.refresh();
          return;
        }
        setCommentError(result.error);
      } catch {
        setCommentError("コメントの投稿に失敗しました。時間をおいて再度お試しください。");
      }
    });
  };

  return (
    <>
      <CardHeader className="flex shrink-0 flex-wrap items-start justify-between gap-m">
        <div>
          <CardTitle id={titleId}>日報</CardTitle>
          <p className="mt-xs text-s text-text-grey">{dateLabel}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-s">
          <Badge tone={statusTone}>{statusLabel}</Badge>
          {report?.submittedAt && (
            <span className="text-xs text-text-grey">
              提出日時 {formatDateTime(report.submittedAt)}
            </span>
          )}
          {onClose && (
            <Button
              ref={closeButtonRef}
              type="button"
              variant="text"
              size="sm"
              onClick={onClose}
              aria-label="閉じる"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody className="grid min-h-0 flex-1 gap-m overflow-y-auto">
        <div className="grid gap-s">
          <Field label="本文" error={bodyError ?? undefined}>
            <Textarea
              rows={7}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              aria-invalid={!!bodyError}
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-s">
            <div className="text-xs text-text-grey">
              {bodyLength}/5000字
              {report?.updatedAt ? ` / 最終更新 ${formatDateTime(report.updatedAt)}` : ""}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-s">
              <Button
                type="button"
                variant="secondary"
                loading={isSavePending}
                loadingLabel="保存中…"
                disabled={isSavePending || isSubmitPending}
                onClick={onSave}
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                下書き保存する
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={isSubmitPending}
                loadingLabel="提出中…"
                disabled={isSavePending || isSubmitPending || bodyLength === 0}
                onClick={onSubmitReport}
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                提出する
              </Button>
            </div>
          </div>
          {formError && (
            <div
              className="rounded-s border border-danger bg-danger-soft p-s text-s text-danger"
              role="alert"
            >
              {formError}
            </div>
          )}
        </div>

        <section className="border-t border-border pt-m">
          <div className="mb-s flex items-center gap-s">
            <MessageSquare className="h-4 w-4 text-text-grey" aria-hidden="true" />
            <h3 className="text-s font-semibold text-text-black">日報コメント</h3>
            <span className="text-xs text-text-grey">{report?.comments.length ?? 0}件</span>
          </div>

          {report ? (
            <>
              {report.comments.length > 0 ? (
                <div className="divide-y divide-border border-y border-border">
                  {report.comments.map((comment) => (
                    <article key={comment.id} className="py-s">
                      <div className="flex flex-wrap items-center gap-s text-xs text-text-grey">
                        <span className="font-medium text-text-black">
                          {comment.authorName ?? "未登録ユーザー"}
                        </span>
                        <time dateTime={comment.createdAt}>
                          {formatCommentDate(comment.createdAt)}
                        </time>
                      </div>
                      <p className="mt-xs whitespace-pre-wrap text-s text-text-black">
                        {comment.body}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-s text-text-grey">コメントはまだありません。</p>
              )}

              <form onSubmit={onSubmitComment} className="mt-m flex flex-col gap-s">
                <Field label="コメント" error={commentError ?? undefined}>
                  <Textarea
                    rows={3}
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    aria-invalid={!!commentError}
                  />
                </Field>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="secondary"
                    loading={isCommentPending}
                    loadingLabel="投稿中…"
                    disabled={isCommentPending || commentBody.trim().length === 0}
                  >
                    投稿する
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <Empty
              title="日報はまだ保存されていません"
              hint="本文を保存するとコメントを投稿できます。"
              className="px-0 py-s"
            />
          )}
        </section>
      </CardBody>
    </>
  );
}

export function DailyReportPanel(props: DailyReportPanelProps) {
  return (
    <Card>
      <DailyReportContent {...props} />
    </Card>
  );
}

export function DailyReportDialog({
  open,
  onClose,
  date,
  dateLabel,
  report,
}: DailyReportDialogProps) {
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    closeButtonRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-scrim p-m"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[calc(100dvh_-_var(--spacing-xl))] w-full max-w-[var(--width-content-max)] flex-col overflow-hidden rounded-l border border-border bg-white shadow-m"
      >
        <DailyReportContent
          date={date}
          dateLabel={dateLabel}
          report={report}
          onClose={onClose}
          closeButtonRef={closeButtonRef}
          titleId={titleId}
        />
      </section>
    </div>
  );
}
