import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listAuditLogs } from "@/server/audit-logs";
import { listUsers } from "@/server/users";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SortHeader } from "@/components/common/sort-header";
import {
  AuditLogsFilter,
  type AuditLogUserOption,
} from "@/components/audit-logs/audit-logs-filter";
import { auditActionLabel, auditActionTone, auditEntityLabel } from "@/lib/audit-labels";

const ACTION_OPTIONS = [
  "case.create",
  "case.update",
  "case.delete",
  "case_person.add",
  "case_person.remove",
  "case_person.resync",
  "person.create",
  "person.update",
  "person.delete",
  "person.resync",
  "document.generate",
  "template.upload",
  "template.update",
  "template.deactivate",
  "user.invite",
  "user.role_change",
  "user.activate",
  "user.deactivate",
] as const;

const ENTITY_OPTIONS = [
  "case",
  "case_person",
  "person",
  "document",
  "template",
  "user",
] as const;

type Search = {
  q?: string;
  user?: string;
  action?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  order?: string;
  page?: string;
};

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));

  const [result, usersRes] = await Promise.all([
    listAuditLogs({
      q: sp.q || undefined,
      userId: sp.user || undefined,
      action: sp.action || undefined,
      entityType: sp.entityType || undefined,
      dateFrom: sp.dateFrom || undefined,
      dateTo: sp.dateTo || undefined,
      sort: sp.sort,
      order: sp.order,
      page,
    }),
    listUsers(),
  ]);

  if (!result.ok) return <p className="text-danger">{result.error}</p>;

  const { items, total, perPage } = result.data;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1;
  const rangeEnd = Math.min(page * perPage, total);

  const users: AuditLogUserOption[] = usersRes.ok
    ? usersRes.data.map((u) => ({ id: u.id, full_name: u.full_name, email: u.email }))
    : [];

  return (
    <>
      <PageHeader
        title="監査ログ"
        description="操作履歴をユーザー・アクション・対象・期間で追跡できます。"
      />

      <Card className="mb-m">
        <AuditLogsFilter
          users={users}
          actions={ACTION_OPTIONS}
          entityTypes={ENTITY_OPTIONS}
        />
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
            title="該当する監査ログがありません"
            hint="絞り込み条件を変えてください。操作が記録されると、ここに履歴が表示されます。"
          />
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <SortHeader column="created_at" label="日時" className="w-[170px]" />
                <TH className="w-[200px]">ユーザー</TH>
                <SortHeader column="action" label="アクション" className="w-[180px]" />
                <SortHeader column="entity_type" label="対象" className="w-[160px]" />
                <TH>詳細</TH>
                <TH className="w-[130px]">IP</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={item.id}>
                  <TD className="whitespace-nowrap tabular-nums">
                    {formatDateTime(item.created_at)}
                  </TD>
                  <TD>
                    <div className="font-medium text-text-black">
                      {item.user_name || item.user_email || "—"}
                    </div>
                    {item.user_name && item.user_email && (
                      <div className="text-xs text-text-grey">{item.user_email}</div>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={auditActionTone(item.action)}>
                      {auditActionLabel(item.action)}
                    </Badge>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {auditEntityLabel(item.entity_type)}
                    {item.entity_id != null && (
                      <span className="ml-xs text-xs text-text-grey tabular-nums">
                        #{item.entity_id}
                      </span>
                    )}
                  </TD>
                  <TD className="max-w-[440px]">
                    {item.detail ? (
                      <details>
                        <summary className="cursor-pointer text-s text-main">
                          JSON を表示
                        </summary>
                        <pre className="mt-xs overflow-x-auto rounded-s bg-grey-6 p-s text-xs">
                          {JSON.stringify(item.detail, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-text-grey">—</span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-text-grey tabular-nums">
                    {item.ip_address ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
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
  if (search.user) params.set("user", search.user);
  if (search.action) params.set("action", search.action);
  if (search.entityType) params.set("entityType", search.entityType);
  if (search.dateFrom) params.set("dateFrom", search.dateFrom);
  if (search.dateTo) params.set("dateTo", search.dateTo);
  if (search.sort) params.set("sort", search.sort);
  if (search.order) params.set("order", search.order);
  params.set("page", String(page));
  return (
    <Link
      href={`/audit-logs?${params.toString()}`}
      className="rounded-s border border-border bg-white px-s py-xs hover:bg-grey-7"
    >
      {children}
    </Link>
  );
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ja-JP");
}
