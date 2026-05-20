import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/ui/empty";
import { listPersons } from "@/server/persons";
import { PersonsFilter } from "@/components/persons/persons-filter";
import { casePersonRoleLabel } from "@/lib/format";

type Search = {
  q?: string;
  type?: "individual" | "corporation" | "";
  page?: string;
};

export default async function PersonsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const res = await listPersons({
    q: sp.q,
    personType: sp.type || undefined,
    page,
    perPage: 20,
  });

  if (!res.ok) {
    return <p className="text-danger">{res.error}</p>;
  }

  const { items, total, perPage } = res.data;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

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

      <Card className="mb-l">
        <PersonsFilter defaultQ={sp.q} defaultType={sp.type ?? ""} />
      </Card>

      <Card>
        {items.length === 0 ? (
          <Empty
            title="登録されている関係者がありません"
            hint="右上の「関係者を登録する」から追加してください。"
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="w-[80px]">区分</TH>
                <TH>氏名・フリガナ</TH>
                <TH className="w-[120px]">既定役割</TH>
                <TH>住所</TH>
                <TH className="w-[160px]">電話番号</TH>
                <TH className="w-[120px]">更新日</TH>
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
                  <TD>
                    {[p.address_pref, p.address_city, p.address_town].filter(Boolean).join(" ")}
                  </TD>
                  <TD>{p.phone ?? "—"}</TD>
                  <TD className="text-text-grey">
                    {new Date(p.updated_at).toLocaleDateString("ja-JP")}
                  </TD>
                </TR>
              ))}
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
  params.set("page", String(page));
  return (
    <Link
      href={`/persons?${params.toString()}`}
      className="rounded-s border border-border bg-white px-s py-xs hover:bg-grey-6"
    >
      {children}
    </Link>
  );
}
