import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { SortHeader } from "@/components/common/sort-header";
import { listPersons } from "@/server/persons";
import { PersonsFilter } from "@/components/persons/persons-filter";
import { casePersonRoleLabel, formatDate, addressFull } from "@/lib/format";

type Search = {
  q?: string;
  type?: "individual" | "corporation" | "";
  sort?: string;
  order?: string;
  page?: string;
};

export default async function PersonsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const res = await listPersons({
    q: sp.q,
    personType: sp.type || undefined,
    sort: sp.sort,
    order: sp.order,
    page,
    perPage: 20,
  });

  if (!res.ok) {
    return <p className="text-danger">{res.error}</p>;
  }

  const { items, total, perPage } = res.data;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1;
  const rangeEnd = Math.min(page * perPage, total);

  return (
    <>
      <PageHeader
        title="関係者台帳"
        description="申請者・所有者などの情報を先に整えておくと、案件へ紐付けるだけで各様式へ反映できます。"
        actions={
          <Link href="/persons/new">
            <Button>関係者を登録する</Button>
          </Link>
        }
      />

      <Card className="mb-m">
        <PersonsFilter />
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
            title="該当する関係者がありません"
            hint="絞り込み条件を変えるか、「関係者を登録する」から追加してください。"
            action={
              <Link href="/persons/new">
                <Button>関係者を登録する</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <SortHeader column="person_type" label="区分" className="w-[80px]" />
                <SortHeader column="name" label="氏名・フリガナ" />
                <SortHeader column="role" label="既定役割" className="w-[120px]" />
                <TH>住所</TH>
                <TH className="w-[160px]">電話番号</TH>
                <SortHeader column="updated" label="更新日" className="w-[120px]" />
              </TR>
            </THead>
            <TBody>
              {items.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Badge tone={p.person_type === "corporation" ? "info" : "neutral"}>
                      {p.person_type === "corporation" ? "法人" : "個人"}
                    </Badge>
                  </TD>
                  <TD>
                    <Link href={`/persons/${p.id}`} className="ui-link-subtle">
                      {p.name}
                    </Link>
                    {p.name_kana && <div className="text-xs text-text-grey">{p.name_kana}</div>}
                  </TD>
                  <TD>
                    {p.default_case_role ? (
                      <Badge tone="info">{casePersonRoleLabel(p.default_case_role)}</Badge>
                    ) : (
                      <span className="text-text-grey">—</span>
                    )}
                  </TD>
                  <TD>{addressFull([p.address_pref, p.address_city, p.address_town]) || "—"}</TD>
                  <TD>{p.phone ?? "—"}</TD>
                  <TD className="tabular-nums text-text-grey">{formatDate(p.updated_at)}</TD>
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
  if (search.type) params.set("type", search.type);
  if (search.sort) params.set("sort", search.sort);
  if (search.order) params.set("order", search.order);
  params.set("page", String(page));
  return (
    <Link
      href={`/persons?${params.toString()}`}
      className="rounded-s border border-border bg-white px-s py-xs hover:bg-grey-7"
    >
      {children}
    </Link>
  );
}
