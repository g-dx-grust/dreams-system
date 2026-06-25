import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { listCases, listAssignableUsers } from "@/server/cases";
import { getCurrentUser } from "@/lib/permissions";
import { CasesFilter } from "@/components/cases/cases-filter";
import { CasesTable } from "@/components/cases/cases-table";
import { caseStatusLabel, isOverdue } from "@/lib/format";
import { tokyoDateKeyAfterDays } from "@/lib/date-time";

type Search = {
  q?: string;
  type?: string;
  status?: string;
  user?: string;
  deadline_from?: string;
  deadline_to?: string;
  overdue?: string;
  sort?: string;
  order?: string;
  page?: string;
};

export default async function CasesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const [res, usersRes, currentUser] = await Promise.all([
    listCases({
      q: sp.q,
      caseType: sp.type,
      status: sp.status,
      assignedUserId: sp.user,
      deadlineFrom: sp.deadline_from,
      deadlineTo: sp.deadline_to,
      overdueOnly: sp.overdue === "1",
      sort: sp.sort,
      order: sp.order,
      page,
      perPage: 20,
    }),
    listAssignableUsers(),
    getCurrentUser(),
  ]);
  if (!res.ok) return <p className="text-danger">{res.error}</p>;

  const { items, total, perPage } = res.data;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const users = usersRes.ok ? usersRes.data : [];
  const userMap = Object.fromEntries(
    users.map((u) => [u.id, { full_name: u.full_name, email: u.email }]),
  );
  const isAdmin = currentUser?.role === "admin";
  const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1;
  const rangeEnd = Math.min(page * perPage, total);
  const dueSoonDateKey = tokyoDateKeyAfterDays(7);
  const visibleOverdue = items.filter((item) => isOverdue(item.deadline_date, item.status)).length;
  const visibleInProgress = items.filter((item) => item.status === "in_progress").length;
  const visibleSubmitted = items.filter((item) => item.status === "submitted").length;
  const visibleDueSoon = items.filter(
    (item) =>
      !isOverdue(item.deadline_date, item.status) &&
      item.deadline_date != null &&
      item.deadline_date <= dueSoonDateKey,
  ).length;

  return (
    <>
      <PageHeader
        title="案件一覧"
        description="申請種別ごとに案件を登録・管理します。"
        actions={
          <Link href="/cases/new">
            <Button>案件を登録する</Button>
          </Link>
        }
      />

      <Card className="mb-m">
        <CasesFilter users={users} />
      </Card>

      <div className="mb-m flex flex-wrap gap-s" aria-label="ステータスで絞り込み">
        <StatusTabLink href={statusHref(sp, "all")} active={!sp.status && sp.overdue !== "1"}>
          すべて <Count value={total} />
        </StatusTabLink>
        <StatusTabLink href={statusHref(sp, "in_progress")} active={sp.status === "in_progress"}>
          {caseStatusLabel("in_progress")} <Count value={visibleInProgress} />
        </StatusTabLink>
        <StatusTabLink href={statusHref(sp, "submitted")} active={sp.status === "submitted"}>
          {caseStatusLabel("submitted")} <Count value={visibleSubmitted} />
        </StatusTabLink>
        <StatusTabLink href={statusHref(sp, "overdue")} active={sp.overdue === "1"}>
          期限超過 <Count value={visibleOverdue} danger={visibleOverdue > 0} />
        </StatusTabLink>
        <StatusTabLink href={statusHref(sp, "due_soon")} active={sp.deadline_to === dueSoonDateKey}>
          期限間近 <Count value={visibleDueSoon} />
        </StatusTabLink>
      </div>

      <div className="mb-s flex items-center justify-between gap-m text-s text-text-grey">
        <p>
          全 <span className="font-semibold text-text-black tabular-nums">{total}</span> 件
          {total > perPage && (
            <span className="ml-xs text-text-quaternary tabular-nums">
              （{rangeStart}〜{rangeEnd} 件を表示）
            </span>
          )}
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <Empty
            title="該当する案件がありません"
            hint="絞り込み条件を変えるか、「案件を登録する」から追加してください。"
            action={
              <Link href="/cases/new">
                <Button>案件を登録する</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <CasesTable items={items} userMap={userMap} isAdmin={isAdmin} />
      )}

      {totalPages > 1 && (
        <div className="mt-m flex items-center justify-between text-s">
          <p className="text-text-grey tabular-nums">
            {rangeStart}〜{rangeEnd} / 全 {total} 件
          </p>
          <div className="flex items-center gap-xs">
            <PaginationLink page={page - 1} disabled={page <= 1} search={sp}>
              前へ
            </PaginationLink>
            <span className="px-s py-xs tabular-nums">
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

function Count({ value, danger = false }: { value: number; danger?: boolean }) {
  return (
    <span
      className={
        danger
          ? "ml-xs rounded-full bg-danger-soft px-xs py-xxs text-xs text-danger tabular-nums"
          : "ml-xs rounded-full bg-grey-7 px-xs py-xxs text-xs text-text-grey tabular-nums"
      }
    >
      {value.toLocaleString("ja-JP")}
    </span>
  );
}

function StatusTabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "inline-flex h-10 items-center rounded-full border border-main bg-white px-m text-s font-semibold text-main shadow-s"
          : "inline-flex h-10 items-center rounded-full border border-border bg-white px-m text-s font-semibold text-text-grey hover:border-border-strong hover:text-text-black"
      }
    >
      {children}
    </Link>
  );
}

function statusHref(
  search: Search,
  status: "all" | "in_progress" | "submitted" | "overdue" | "due_soon",
) {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.type) params.set("type", search.type);
  if (search.user) params.set("user", search.user);
  if (search.deadline_from) params.set("deadline_from", search.deadline_from);
  if (search.sort) params.set("sort", search.sort);
  if (search.order) params.set("order", search.order);
  if (status === "in_progress" || status === "submitted") params.set("status", status);
  if (status === "overdue") params.set("overdue", "1");
  if (status === "due_soon") params.set("deadline_to", tokyoDateKeyAfterDays(7));
  const qs = params.toString();
  return qs ? `/cases?${qs}` : "/cases";
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
  if (search.sort) params.set("sort", search.sort);
  if (search.order) params.set("order", search.order);
  params.set("page", String(page));
  return (
    <Link
      href={`/cases?${params.toString()}`}
      className="rounded-s border border-border bg-white px-s py-xs hover:bg-grey-7"
    >
      {children}
    </Link>
  );
}
