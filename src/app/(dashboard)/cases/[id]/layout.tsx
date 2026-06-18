import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabNav } from "@/components/ui/tabs";
import { getCaseSummaryBand } from "@/server/cases";
import { CASE_STATUSES } from "@/lib/validators/case";
import {
  caseStatusLabel,
  caseStatusTone,
  caseTypeLabel,
  caseTypeTone,
  formatDate,
  formatJPY,
  isOverdue,
} from "@/lib/format";

// 進捗バーの線形ステップ。取消（cancelled）は分岐終端のため割合計算から除外する。
const PROGRESS_STEPS = CASE_STATUSES.filter((s) => s !== "cancelled");

function statusProgress(status: string): number | null {
  if (status === "cancelled") return null;
  const index = PROGRESS_STEPS.indexOf(status as (typeof PROGRESS_STEPS)[number]);
  if (index < 0) return null;
  return Math.round((index / (PROGRESS_STEPS.length - 1)) * 100);
}

export default async function CaseDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getCaseSummaryBand(Number(id));
  if (!res.ok) notFound();
  const { case: c, assignedUserName, invoiceInclTax, outstanding } = res.data;
  const overdue = isOverdue(c.deadline_date, c.status);
  const progress = statusProgress(c.status);
  const hasOutstanding = outstanding != null && outstanding > 0;

  return (
    <>
      <PageHeader
        title={c.case_name}
        description={c.case_number}
        actions={
          <Link href="/cases">
            <Button variant="secondary">一覧へ戻る</Button>
          </Link>
        }
      />

      <div className="mb-l rounded-m border border-border bg-white">
        <div className="flex flex-wrap items-center gap-x-l gap-y-s px-m py-s text-s">
          <div className="flex items-center gap-s">
            <Badge tone={caseTypeTone(c.case_type)}>{caseTypeLabel(c.case_type)}</Badge>
            <Badge tone={caseStatusTone(c.status)}>{caseStatusLabel(c.status)}</Badge>
          </div>

          <span className="flex items-center gap-xs">
            <span className="text-text-grey">担当者</span>
            <span className="text-text-black">{assignedUserName ?? "未割当"}</span>
          </span>

          <span className="flex items-center gap-xs">
            <span className="text-text-grey">請求</span>
            <span className="text-text-black tabular-nums">{formatJPY(invoiceInclTax)}</span>
          </span>

          <span className="flex items-center gap-xs">
            <span className="text-text-grey">未収</span>
            <span
              className={
                hasOutstanding
                  ? "font-semibold text-danger tabular-nums"
                  : "text-text-black tabular-nums"
              }
            >
              {formatJPY(outstanding)}
            </span>
          </span>

          {c.submission_target && (
            <span className="flex items-center gap-xs">
              <span className="text-text-grey">提出先</span>
              <span className="text-text-black">{c.submission_target}</span>
            </span>
          )}

          {c.deadline_date && (
            <span className="flex items-center gap-xs">
              <span className="text-text-grey">締切</span>
              <span className={overdue ? "font-semibold text-danger tabular-nums" : "text-text-black tabular-nums"}>
                {formatDate(c.deadline_date)}
                {overdue && "（超過）"}
              </span>
            </span>
          )}
        </div>

        {progress != null && (
          <div className="flex items-center gap-m border-t border-border px-m py-s">
            <span className="shrink-0 text-s text-text-grey">進捗</span>
            <div
              className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-grey-7"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label={`進捗 ${caseStatusLabel(c.status)}`}
            >
              <div
                className="h-full rounded-full bg-main transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="shrink-0 text-s text-text-grey tabular-nums">{progress}%</span>
          </div>
        )}
      </div>

      <TabNav
        items={[
          { href: `/cases/${id}`, label: "基本情報" },
          { href: `/cases/${id}/persons`, label: "関係者" },
          { href: `/cases/${id}/parcels`, label: "土地情報" },
          { href: `/cases/${id}/map`, label: "地図" },
          { href: `/cases/${id}/financial`, label: "金額" },
          { href: `/cases/${id}/documents`, label: "帳票生成" },
          { href: `/cases/${id}/history`, label: "生成履歴" },
        ]}
      />

      <div className="mt-l">{children}</div>
    </>
  );
}
