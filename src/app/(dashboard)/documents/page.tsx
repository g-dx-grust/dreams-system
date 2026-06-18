import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import {
  listDocuments,
  listDocumentTemplateOptions,
  type DocumentFileType,
} from "@/server/documents";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { DocumentHistoryFilter } from "@/components/documents/document-history-filter";
import { DocumentHistoryTable } from "@/components/documents/document-history-table";

type Search = {
  q?: string;
  case?: string;
  template?: string;
  file_type?: string;
  date_from?: string;
  date_to?: string;
  sort?: string;
  order?: string;
  page?: string;
};

const PER_PAGE = 20;

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const templateId = sp.template ? Number(sp.template) : undefined;
  const fileType =
    sp.file_type === "docx" || sp.file_type === "xlsx"
      ? (sp.file_type as DocumentFileType)
      : undefined;

  const [result, templatesResult] = await Promise.all([
    listDocuments({
      q: sp.q,
      caseNumber: sp.case,
      templateId: templateId && Number.isFinite(templateId) ? templateId : undefined,
      fileType,
      dateFrom: sp.date_from,
      dateTo: sp.date_to,
      sort: sp.sort,
      order: sp.order,
      page,
      perPage: PER_PAGE,
    }),
    listDocumentTemplateOptions(),
  ]);

  if (!result.ok) {
    return (
      <>
        <PageHeader title="帳票履歴" description="生成済み帳票の一覧とダウンロード" />
        <p className="text-s text-danger">{result.error}</p>
      </>
    );
  }

  const { items, total, perPage } = result.data;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const templates = templatesResult.ok ? templatesResult.data : [];
  const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1;
  const rangeEnd = Math.min(page * perPage, total);

  return (
    <>
      <PageHeader title="帳票履歴" description="生成済み帳票の一覧とダウンロード" />

      <Card className="mb-m">
        <DocumentHistoryFilter templates={templates} />
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
            title="該当する帳票履歴がありません"
            hint="絞り込み条件を変えるか、案件詳細から帳票を生成してください。"
            action={
              <Link href="/cases">
                <Button variant="secondary">案件一覧へ</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <Card>
          <DocumentHistoryTable items={items} showCaseNumber sortable />
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
  if (search.case) params.set("case", search.case);
  if (search.template) params.set("template", search.template);
  if (search.file_type) params.set("file_type", search.file_type);
  if (search.date_from) params.set("date_from", search.date_from);
  if (search.date_to) params.set("date_to", search.date_to);
  if (search.sort) params.set("sort", search.sort);
  if (search.order) params.set("order", search.order);
  params.set("page", String(page));
  return (
    <Link
      href={`/documents?${params.toString()}`}
      className="rounded-s border border-border bg-white px-s py-xs hover:bg-grey-7"
    >
      {children}
    </Link>
  );
}
