import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, FileStack } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { listTemplates, type TemplateListRow } from "@/server/templates";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SortHeader } from "@/components/common/sort-header";
import { Card, CardBody } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { TemplateFilter } from "@/components/templates/template-filter";
import { caseTypeLabel, formatDate } from "@/lib/format";

type TemplateVersionGroup = {
  current: TemplateListRow;
  previous: TemplateListRow[];
};

function buildTemplateGroupKey(template: TemplateListRow) {
  const caseTypes = [...(template.applicable_case_types ?? [])].sort().join(",");
  return [
    template.category_id,
    template.name.trim(),
    template.file_type,
    template.municipality_id ?? "all",
    caseTypes,
  ].join("::");
}

type TemplateSortColumn = "name" | "file_type" | "version" | "is_active" | "updated_at";

const TEMPLATE_SORT_COLUMNS: readonly TemplateSortColumn[] = [
  "name",
  "file_type",
  "version",
  "is_active",
  "updated_at",
];

function parseTemplateSortColumn(value: string | undefined): TemplateSortColumn {
  return TEMPLATE_SORT_COLUMNS.find((column) => column === value) ?? "name";
}

function compareTemplateGroups(
  a: TemplateListRow,
  b: TemplateListRow,
  column: TemplateSortColumn,
): number {
  switch (column) {
    case "file_type":
      return a.file_type.localeCompare(b.file_type, "ja");
    case "version":
      return a.version - b.version;
    case "is_active":
      return Number(a.is_active) - Number(b.is_active);
    case "updated_at":
      return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
    case "name":
    default:
      return a.name.localeCompare(b.name, "ja");
  }
}

function groupTemplates(
  templates: TemplateListRow[],
  sort: TemplateSortColumn,
  order: "asc" | "desc",
): TemplateVersionGroup[] {
  const grouped = new Map<string, TemplateListRow[]>();

  for (const template of templates) {
    const key = buildTemplateGroupKey(template);
    const current = grouped.get(key) ?? [];
    current.push(template);
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .flatMap((versions) => {
      const sorted = [...versions].sort((a, b) => {
        if (b.version !== a.version) return b.version - a.version;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });

      const [current, ...previous] = sorted;
      return current ? [{ current, previous }] : [];
    })
    .sort((a, b) => {
      const base = compareTemplateGroups(a.current, b.current, sort);
      const tieBreak = base !== 0 ? base : a.current.name.localeCompare(b.current.name, "ja");
      return order === "desc" ? -tieBreak : tieBreak;
    });
}

function mappingStatus(template: TemplateListRow) {
  if (template.mapping_count > 0) {
    return { tone: "success" as const, label: `${template.mapping_count} 件` };
  }

  return {
    tone: "warning" as const,
    label: template.file_type === "xlsx" ? "セル未設定" : "未検出",
  };
}

type TemplateSearch = {
  categoryId?: string;
  caseType?: string;
  areaId?: string;
  prefectureId?: string;
  municipalityId?: string;
  q?: string;
  sort?: string;
  order?: string;
  page?: string;
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<TemplateSearch>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") {
    return (
      <>
        <PageHeader title="テンプレート" />
        <Card>
          <CardBody>
            <p className="text-s text-danger">管理者権限が必要です。</p>
          </CardBody>
        </Card>
      </>
    );
  }

  const sp = await searchParams;
  const sortColumn = parseTemplateSortColumn(sp.sort);
  const sortOrder: "asc" | "desc" = sp.order === "desc" ? "desc" : "asc";

  const result = await listTemplates({
    categoryId: sp.categoryId ? Number(sp.categoryId) : undefined,
    caseType: sp.caseType || undefined,
    areaId: sp.areaId ? Number(sp.areaId) : undefined,
    prefectureId: sp.prefectureId ? Number(sp.prefectureId) : undefined,
    municipalityId: sp.municipalityId ? Number(sp.municipalityId) : undefined,
    q: sp.q || undefined,
    sort: sortColumn,
    order: sortOrder,
    activeOnly: false,
  });

  if (!result.ok) {
    return (
      <>
        <PageHeader title="テンプレート" />
        <p className="text-s text-danger">{result.error}</p>
      </>
    );
  }

  const { categories, locationAreas, templates } = result.data;
  const templateGroups = groupTemplates(templates, sortColumn, sortOrder);
  const page = Math.max(1, Number(sp.page ?? 1));
  const perPage = 20;
  const total = templateGroups.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pagedTemplateGroups = templateGroups.slice((page - 1) * perPage, page * perPage);
  const hiddenVersionCount = templateGroups.reduce((sum, group) => sum + group.previous.length, 0);
  const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1;
  const rangeEnd = Math.min(page * perPage, total);

  return (
    <>
      <PageHeader
        title="テンプレート"
        description="様式ファイルの登録・マッピング設定"
        actions={
          <Link
            href="/templates/new"
            className="inline-flex h-7 items-center justify-center rounded-s bg-main px-s text-s font-medium leading-tight text-white transition-colors hover:bg-main-hover"
          >
            新規アップロード
          </Link>
        }
      />

      <div className="flex flex-col gap-m">
        <TemplateFilter categories={categories} locationAreas={locationAreas} />

        <div className="flex flex-wrap items-center justify-between gap-m text-s text-text-grey">
          <p>
            全 <span className="font-semibold text-text-black tabular-nums">{total}</span> 件
            {total > perPage && (
              <span className="ml-xs text-text-quaternary tabular-nums">
                （{rangeStart}〜{rangeEnd} 件を表示）
              </span>
            )}
          </p>
          <p className="text-xs text-text-grey tabular-nums">
            最新版 {total} 件 / 旧版 {hiddenVersionCount} 件
          </p>
        </div>

        {total === 0 ? (
          <Card>
            <Empty
              title="該当するテンプレートがありません"
              hint="絞り込み条件を変えるか、「新規アップロード」から様式ファイルを登録してください。"
              action={
                <Link
                  href="/templates/new"
                  className="inline-flex h-8 items-center justify-center rounded-s bg-main px-m text-s font-medium leading-tight text-white transition-colors hover:bg-main-hover"
                >
                  新規アップロード
                </Link>
              }
            />
          </Card>
        ) : (
          <Card>
            <CardBody className="p-0">
              <div className="border-b border-border px-l py-s text-xs text-text-grey">
                最新版のみを表示しています。新しいファイルは「マッピング」列を確認してから生成に使います。
              </div>

              <Table>
                <THead>
                  <TR>
                    <SortHeader column="name" label="様式名" />
                    <TH>カテゴリ</TH>
                    <TH>対象自治体</TH>
                    <SortHeader column="file_type" label="形式" className="w-[90px]" />
                    <TH>対応案件種別</TH>
                    <TH>マッピング</TH>
                    <SortHeader column="version" label="最新版" className="w-[120px]" />
                    <SortHeader column="is_active" label="ステータス" className="w-[120px]" />
                    <TH className="w-[260px]">操作</TH>
                  </TR>
                </THead>
                <TBody>
                  {pagedTemplateGroups.map(({ current, previous }) => {
                    const mapping = mappingStatus(current);

                    return (
                      <TR key={current.id}>
                        <TD className="align-top">
                          <Link href={`/templates/${current.id}`} className="ui-link">
                            {current.name}
                          </Link>
                        </TD>
                        <TD className="align-top">{current.category_name}</TD>
                        <TD className="align-top">
                          {current.location_label ?? (
                            <span className="text-xs text-text-grey">未分類</span>
                          )}
                        </TD>
                        <TD className="align-top">
                          <Badge tone="neutral">.{current.file_type}</Badge>
                        </TD>
                        <TD className="align-top">
                          {current.applicable_case_types &&
                          current.applicable_case_types.length > 0 ? (
                            <div className="flex flex-wrap gap-xs">
                              {current.applicable_case_types.map((ct) => (
                                <Badge key={ct} tone="info">
                                  {caseTypeLabel(ct)}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-text-grey">全種別</span>
                          )}
                        </TD>
                        <TD className="align-top">
                          <div className="flex flex-col gap-xxs">
                            <Badge tone={mapping.tone}>{mapping.label}</Badge>
                            <span className="text-xs text-text-grey">
                              {current.file_type === "xlsx" ? "セル座標" : "差し込み名"}
                            </span>
                          </div>
                        </TD>
                        <TD className="align-top tabular-nums">
                          <div className="flex items-center gap-xs">
                            <span className="font-medium">v{current.version}</span>
                            <Badge tone="success">最新版</Badge>
                          </div>
                        </TD>
                        <TD className="align-top">
                          <Badge tone={current.is_active ? "success" : "neutral"}>
                            {current.is_active ? "有効" : "無効"}
                          </Badge>
                        </TD>
                        <TD className="w-[260px] align-top">
                          <div className="flex items-center gap-m">
                            <Link
                              href={`/templates/${current.id}/mapping`}
                              className="ui-link text-s"
                            >
                              マッピングを開く
                            </Link>
                            {previous.length > 0 ? (
                              <details className="group/version">
                                <summary className="inline-flex h-7 cursor-pointer list-none items-center gap-xxs rounded-s px-xs text-xs text-text-grey hover:bg-grey-7 hover:text-text-black [&::-webkit-details-marker]:hidden">
                                  <FileStack className="h-3.5 w-3.5" aria-hidden="true" />
                                  旧版 {previous.length} 件
                                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open/version:rotate-90" aria-hidden="true" />
                                </summary>
                                <ul className="mt-xs flex flex-col gap-xs rounded-s border border-border bg-grey-7 p-xs">
                                  {previous.map((version) => (
                                    <li
                                      key={version.id}
                                      className="flex items-center justify-between gap-s rounded-s border border-border bg-white px-s py-xs"
                                    >
                                      <span className="inline-flex items-center gap-xs">
                                        <span className="font-medium tabular-nums">
                                          v{version.version}
                                        </span>
                                        <Badge tone="neutral">無効</Badge>
                                        <span className="text-xs text-text-grey tabular-nums">
                                          {formatDate(version.created_at)} 登録
                                        </span>
                                      </span>
                                      <Link
                                        href={`/templates/${version.id}`}
                                        className="ui-link text-xs"
                                      >
                                        開く
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : (
                              <span className="inline-flex h-7 items-center text-xs text-text-quaternary">
                                旧版なし
                              </span>
                            )}
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-l py-m text-s">
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
            </CardBody>
          </Card>
        )}
      </div>
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
  search: TemplateSearch;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="px-s py-xs text-text-disabled">{children}</span>;
  }

  const params = new URLSearchParams();
  if (search.categoryId) params.set("categoryId", search.categoryId);
  if (search.caseType) params.set("caseType", search.caseType);
  if (search.areaId) params.set("areaId", search.areaId);
  if (search.prefectureId) params.set("prefectureId", search.prefectureId);
  if (search.municipalityId) params.set("municipalityId", search.municipalityId);
  if (search.q) params.set("q", search.q);
  if (search.sort) params.set("sort", search.sort);
  if (search.order) params.set("order", search.order);
  params.set("page", String(page));

  return (
    <Link
      href={`/templates?${params.toString()}`}
      className="rounded-s border border-border bg-white px-s py-xs hover:bg-grey-7"
    >
      {children}
    </Link>
  );
}
