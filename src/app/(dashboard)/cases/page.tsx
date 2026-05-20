import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { listCases, listAssignableUsers } from "@/server/cases";
import {
  caseStatusLabel,
  caseStatusTone,
  caseTypeLabel,
  caseTypeTone,
  formatDate,
  isOverdue,
} from "@/lib/format";
import { cn } from "@/lib/cn";
import { CasesFilter } from "@/components/cases/cases-filter";

type Search = {
  q?: string;
  type?: string;
  status?: string;
  user?: string;
  deadline_from?: string;
  deadline_to?: string;
  overdue?: string;
  page?: string;
};

export default async function CasesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const [res, usersRes] = await Promise.all([
    listCases({
      q: sp.q,
      caseType: sp.type,
      status: sp.status,
      assignedUserId: sp.user,
      deadlineFrom: sp.deadline_from,
      deadlineTo: sp.deadline_to,
      overdueOnly: sp.overdue === "1",
      page,
      perPage: 20,
    }),
    listAssignableUsers(),
  ]);
  if (!res.ok) return <p className="text-danger">{res.error}</p>;

  const { items, total, perPage } = res.data;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const users = usersRes.ok ? usersRes.data : [];
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  return (
    <>
      <PageHeader
        title="案件"
        description="申請業務ごとに 1 案件として管理します。関係者・土地・金額・帳票を案件に紐付けます。"
        actions={
          <Link href="/cases/new">
            <Button>案件を登録する</Button>
          </Link>
        }
      />

      <Card className="mb-l">
        <CasesFilter
          defaultQ={sp.q}
          defaultType={sp.type}
          defaultStatus={sp.status}
          defaultUser={sp.user}
          defaultDeadlineFrom={sp.deadline_from}
          defaultDeadlineTo={sp.deadline_to}
          defaultOverdue={sp.overdue === "1"}
          users={users}
        />
      </Card>

      <Card>
        {items.length === 0 ? (
          <Empty
            title="案件がありません"
            hint="「案件を登録する」から最初の案件を追加してください。"
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="w-[140px]">案件番号</TH>
                <TH>案件名</TH>
                <TH className="w-[140px]">種別</TH>
                <TH className="w-[120px]">ステータス</TH>
                <TH className="w-[120px]">担当者</TH>
                <TH className="w-[140px]">提出先</TH>
                <TH className="w-[120px]">締切日</TH>
                <TH className="w-[80px]">操作</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((c) => {
                const overdue = isOverdue(c.deadline_date, c.status);
                const assignedUser =
                  c.assigned_user_id != null ? userMap[c.assigned_user_id] : undefined;
                return (
                  <TR key={c.id}>
                    <TD className="font-mono text-s">
                      <Link href={`/cases/${c.id}`} className="ui-link">
                        {c.case_number}
                      </Link>
                    </TD>
                    <TD>
                      <Link href={`/cases/${c.id}`} className="ui-link-subtle">
                        {c.case_name}
                      </Link>
                    </TD>
                    <TD>
                      <Badge tone={caseTypeTone(c.case_type)}>{caseTypeLabel(c.case_type)}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={caseStatusTone(c.status)}>{caseStatusLabel(c.status)}</Badge>
                    </TD>
                    <TD className="text-text-grey">
                      {assignedUser?.full_name ?? assignedUser?.email ?? "—"}
                    </TD>
                    <TD className="text-text-grey">{c.submission_target ?? "—"}</TD>
                    <TD className={cn(overdue && "font-medium text-danger")}>
                      {formatDate(c.deadline_date)}
                    </TD>
                    <TD>
                      <Link href={`/cases/${c.id}`} className="ui-link text-s">
                        詳細
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="mt-m flex items-center justify-between text-s">
          <p className="text-text-grey">
            全 {total} 件中 {(page - 1) * perPage + 1}〜{Math.min(page * perPage, total)} 件
          </p>
          <div className="flex gap-xs">
            <PaginationLink page={page - 1} disabled={page <= 1} search={sp}>
              前へ
            </PaginationLink>
            <span className="px-s py-xs">
              {page} / {totalPages}
            </span>
            <PaginationLink page={page + 1} disabled={page >= totalPages} search={sp}>
              次へ
            </PaginationLink>
          </div>
        </div>
      )}
    </>
  );
}

function PaginationLink({
  page,
  disabled,
  search,
  children,
}: {
  page: number;
  disabled: boolean;
  search: Search;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="px-s py-xs text-text-disabled">{children}</span>;
  }
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.type) params.set("type", search.type);
  if (search.status) params.set("status", search.status);
  if (search.user) params.set("user", search.user);
  if (search.deadline_from) params.set("deadline_from", search.deadline_from);
  if (search.deadline_to) params.set("deadline_to", search.deadline_to);
  if (search.overdue) params.set("overdue", search.overdue);
  params.set("page", String(page));
  return (
    <Link
      href={`/cases?${params.toString()}`}
      className="rounded-s border border-border bg-white px-s py-xs hover:bg-grey-6"
    >
      {children}
    </Link>
  );
}
