import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabNav } from "@/components/ui/tabs";
import { getCaseSummary } from "@/server/cases";
import {
  caseStatusLabel,
  caseStatusTone,
  caseTypeLabel,
  caseTypeTone,
  formatDate,
  isOverdue,
} from "@/lib/format";

export default async function CaseDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getCaseSummary(Number(id));
  if (!res.ok) notFound();
  const c = res.data;
  const overdue = isOverdue(c.deadline_date, c.status);

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

      <div className="mb-l flex flex-wrap items-center gap-s text-s">
        <Badge tone={caseTypeTone(c.case_type)}>{caseTypeLabel(c.case_type)}</Badge>
        <Badge tone={caseStatusTone(c.status)}>{caseStatusLabel(c.status)}</Badge>
        {c.submission_target && (
          <span className="text-text-grey">提出先: {c.submission_target}</span>
        )}
        {c.deadline_date && (
          <span className={overdue ? "font-medium text-danger" : "text-text-grey"}>
            締切: {formatDate(c.deadline_date)}
            {overdue && "（超過）"}
          </span>
        )}
      </div>

      <TabNav
        items={[
          { href: `/cases/${id}`, label: "基本情報" },
          { href: `/cases/${id}/persons`, label: "関係者" },
          { href: `/cases/${id}/parcels`, label: "土地情報" },
          { href: `/cases/${id}/financial`, label: "金額" },
          { href: `/cases/${id}/documents`, label: "帳票生成" },
          { href: `/cases/${id}/history`, label: "生成履歴" },
        ]}
      />

      <div className="mt-l">{children}</div>
    </>
  );
}
