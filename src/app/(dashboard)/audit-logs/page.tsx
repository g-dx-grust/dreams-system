import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listAuditLogs } from "@/server/audit-logs";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    entityType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const result = await listAuditLogs({
    action: sp.action || undefined,
    entityType: sp.entityType || undefined,
    dateFrom: sp.dateFrom || undefined,
    dateTo: sp.dateTo || undefined,
    page,
  });

  return (
    <>
      <PageHeader
        title="監査ログ"
        description="操作履歴を日付・対象・アクションで追跡できます"
      />

      <div className="flex flex-col gap-m">
        <Card>
          <CardBody>
            <form className="flex flex-wrap items-end gap-s">
              <div className="flex flex-col gap-xs">
                <label className="text-s font-medium">アクション</label>
                <Select name="action" defaultValue={sp.action ?? ""} className="w-[220px]">
                  <option value="">すべて</option>
                  {ACTION_OPTIONS.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-xs">
                <label className="text-s font-medium">対象</label>
                <Select
                  name="entityType"
                  defaultValue={sp.entityType ?? ""}
                  className="w-[180px]"
                >
                  <option value="">すべて</option>
                  {ENTITY_OPTIONS.map((entityType) => (
                    <option key={entityType} value={entityType}>
                      {entityType}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-xs">
                <label className="text-s font-medium">開始日</label>
                <Input type="date" name="dateFrom" defaultValue={sp.dateFrom ?? ""} />
              </div>

              <div className="flex flex-col gap-xs">
                <label className="text-s font-medium">終了日</label>
                <Input type="date" name="dateTo" defaultValue={sp.dateTo ?? ""} />
              </div>

              <Button type="submit" variant="primary">
                絞り込む
              </Button>
              <Link href="/audit-logs">
                <Button type="button" variant="secondary">
                  クリア
                </Button>
              </Link>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-0">
            {result.ok ? (
              <>
                <div className="border-b border-border px-l py-m text-s text-text-grey">
                  {result.data.total.toLocaleString("ja-JP")} 件
                </div>
                {result.data.items.length === 0 ? (
                  <p className="px-l py-l text-s text-text-grey">該当する監査ログはありません。</p>
                ) : (
                  <>
                    <Table>
                      <THead>
                        <TR>
                          <TH>日時</TH>
                          <TH>ユーザー</TH>
                          <TH>アクション</TH>
                          <TH>対象</TH>
                          <TH>詳細</TH>
                          <TH>IP</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {result.data.items.map((item) => (
                          <TR key={item.id}>
                            <TD className="whitespace-nowrap">{formatDateTime(item.created_at)}</TD>
                            <TD>
                              <div className="font-medium">
                                {item.user_name || item.user_email || "—"}
                              </div>
                              {item.user_name && item.user_email && (
                                <div className="text-xs text-text-grey">{item.user_email}</div>
                              )}
                            </TD>
                            <TD>
                              <Badge tone={actionTone(item.action)}>{item.action}</Badge>
                            </TD>
                            <TD className="whitespace-nowrap">
                              {item.entity_type ?? "—"}
                              {item.entity_id != null ? ` #${item.entity_id}` : ""}
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
                            <TD className="whitespace-nowrap text-xs text-text-grey">
                              {item.ip_address ?? "—"}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>

                    <div className="flex items-center justify-between border-t border-border px-l py-m">
                      <span className="text-s text-text-grey">
                        {result.data.page} / {Math.max(1, Math.ceil(result.data.total / result.data.perPage))}
                        ページ
                      </span>
                      <div className="flex items-center gap-xs">
                        <PageLink
                          page={result.data.page - 1}
                          disabled={result.data.page <= 1}
                          searchParams={sp}
                        >
                          前へ
                        </PageLink>
                        <PageLink
                          page={result.data.page + 1}
                          disabled={result.data.page * result.data.perPage >= result.data.total}
                          searchParams={sp}
                        >
                          次へ
                        </PageLink>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="p-m text-s text-danger">{result.error}</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function PageLink({
  page,
  disabled,
  searchParams,
  children,
}: {
  page: number;
  disabled: boolean;
  searchParams: {
    action?: string;
    entityType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  };
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button type="button" variant="secondary" size="sm" disabled>
        {children}
      </Button>
    );
  }

  const params = new URLSearchParams();
  if (searchParams.action) params.set("action", searchParams.action);
  if (searchParams.entityType) params.set("entityType", searchParams.entityType);
  if (searchParams.dateFrom) params.set("dateFrom", searchParams.dateFrom);
  if (searchParams.dateTo) params.set("dateTo", searchParams.dateTo);
  params.set("page", String(page));

  return (
    <Link href={`/audit-logs?${params.toString()}`}>
      <Button type="button" variant="secondary" size="sm">
        {children}
      </Button>
    </Link>
  );
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ja-JP");
}

function actionTone(action: string): "neutral" | "info" | "warning" | "success" | "danger" {
  if (action.endsWith(".delete") || action.endsWith(".remove") || action.endsWith(".deactivate")) {
    return "danger";
  }
  if (action.endsWith(".create") || action.endsWith(".invite") || action.endsWith(".generate")) {
    return "success";
  }
  if (action.endsWith(".update") || action.endsWith(".resync") || action.endsWith(".role_change")) {
    return "info";
  }
  if (action.endsWith(".activate")) return "success";
  return "neutral";
}
