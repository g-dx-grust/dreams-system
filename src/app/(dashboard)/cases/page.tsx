import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { listCases, listAssignableUsers } from "@/server/cases";
import { getCurrentUser } from "@/lib/permissions";
import { CasesFilter } from "@/components/cases/cases-filter";
import { CasesTable } from "@/components/cases/cases-table";
import { isOverdue } from "@/lib/format";

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
  const visibleOverdue = items.filter((item) => isOverdue(item.deadline_date, item.status)).length;
  const visibleInProgress = items.filter((item) => item.status === "in_progress").length;
  const visibleSubmitted = items.filter((item) => item.status === "submitted").length;

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

      <section className="mb-m grid grid-cols-2 gap-s lg:grid-cols-4" aria-label="案件一覧サマリ">
        <SummaryTile label="全案件" value={total} note={`${rangeStart}〜${rangeEnd}件を表示`} />
        <SummaryTile label="表示中の進行中" value={visibleInProgress} note="対応が進行中の案件" />
        <SummaryTile label="表示中の提出済み" value={visibleSubmitted} note="提出後の確認対象" />
        <SummaryTile
          label="表示中の期限超過"
          value={visibleOverdue}
          note="締切日を過ぎた案件"
          danger={visibleOverdue > 0}
        />
      </section>

      <Card className="mb-m border-border-strong">
        <CasesFilter users={users} />
      </Card>

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

function SummaryTile({
  label,
  value,
  note,
  danger = false,
}: {
  label: string;
  value: number;
  note: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-m border border-border bg-white px-m py-s shadow-s">
      <p className="text-xs font-semibold text-text-grey">{label}</p>
      <p className={danger ? "mt-xxs text-xl font-semibold text-danger" : "mt-xxs text-xl font-semibold text-text-black"}>
        <span className="tabular-nums">{value.toLocaleString("ja-JP")}</span>
        <span className="ml-xxs text-s font-normal text-text-grey">件</span>
      </p>
      <p className="mt-xxs text-xs text-text-quaternary">{note}</p>
    </div>
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
