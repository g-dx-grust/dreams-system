import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, FileStack } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { listTemplates, type TemplateListRow } from "@/server/templates";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
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

function groupTemplates(templates: TemplateListRow[]): TemplateVersionGroup[] {
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
    .sort((a, b) => a.current.name.localeCompare(b.current.name, "ja"));
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

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    categoryId?: string;
    caseType?: string;
    areaId?: string;
    prefectureId?: string;
    municipalityId?: string;
    page?: string;
  }>;
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
  const result = await listTemplates({
    categoryId: sp.categoryId ? Number(sp.categoryId) : undefined,
    caseType: sp.caseType || undefined,
    areaId: sp.areaId ? Number(sp.areaId) : undefined,
    prefectureId: sp.prefectureId ? Number(sp.prefectureId) : undefined,
    municipalityId: sp.municipalityId ? Number(sp.municipalityId) : undefined,
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
  const templateGroups = groupTemplates(templates);
  const page = Math.max(1, Number(sp.page ?? 1));
  const perPage = 20;
  const totalPages = Math.max(1, Math.ceil(templateGroups.length / perPage));
  const pagedTemplateGroups = templateGroups.slice((page - 1) * perPage, page * perPage);
  const hiddenVersionCount = templateGroups.reduce((sum, group) => sum + group.previous.length, 0);

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

        <Card>
          <CardBody className="p-0">
            {templateGroups.length === 0 ? (
              <Empty title="テンプレートがありません。" />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-s border-b border-border px-l py-s text-xs text-text-grey">
                  <p>
                    最新版のみを表示しています。新しいファイルは「マッピング」列を確認してから生成に使います。
                  </p>
                  <p>
                    最新版 {templateGroups.length} 件 / 旧版 {hiddenVersionCount} 件
                  </p>
                </div>

                <Table>
                  <THead>
                    <TR>
                      <TH>様式名</TH>
                      <TH>カテゴリ</TH>
                      <TH>対象自治体</TH>
                      <TH>形式</TH>
                      <TH>対応案件種別</TH>
                      <TH>マッピング</TH>
                      <TH>最新版</TH>
                      <TH>ステータス</TH>
                      <TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {pagedTemplateGroups.map(({ current, previous }) => {
                      const mapping = mappingStatus(current);

                      return (
                        <TR key={current.id}>
                          <TD>
                            <div className="flex flex-col gap-xxs">
                              <Link href={`/templates/${current.id}`} className="ui-link">
                                {current.name}
                              </Link>
                              {previous.length > 0 && (
                                <span className="text-xs text-text-grey">
                                  旧版 {previous.length} 件あり
                                </span>
                              )}
                            </div>
                          </TD>
                          <TD>{current.category_name}</TD>
                          <TD>
                            {current.location_label ?? (
                              <span className="text-xs text-text-grey">未分類</span>
                            )}
                          </TD>
                          <TD>
                            <Badge tone="neutral">.{current.file_type}</Badge>
                          </TD>
                          <TD>
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
                          <TD>
                            <div className="flex flex-col gap-xxs">
                              <Badge tone={mapping.tone}>{mapping.label}</Badge>
                              <span className="text-xs text-text-grey">
                                {current.file_type === "xlsx" ? "セル座標" : "差し込み名"}
                              </span>
                            </div>
                          </TD>
                          <TD>
                            <div className="flex items-center gap-xs">
                              <span className="font-medium">v{current.version}</span>
                              <Badge tone="success">最新版</Badge>
                            </div>
                          </TD>
                          <TD>
                            <Badge tone={current.is_active ? "success" : "neutral"}>
                              {current.is_active ? "有効" : "無効"}
                            </Badge>
                          </TD>
                          <TD className="w-[240px]">
                            <div className="flex flex-col items-start gap-xs">
                              <Link
                                href={`/templates/${current.id}/mapping`}
                                className="ui-link text-s"
                              >
                                マッピングを開く
                              </Link>

                              {previous.length > 0 ? (
                                <details className="w-full rounded-m border border-border bg-grey-6/70">
                                  <summary className="flex cursor-pointer list-none items-center justify-between gap-s px-s py-xs text-xs font-medium text-text-black hover:bg-grey-7 [&::-webkit-details-marker]:hidden">
                                    <span className="inline-flex items-center gap-xxs">
                                      <FileStack className="h-3.5 w-3.5 text-text-grey" />
                                      旧版 {previous.length} 件
                                    </span>
                                    <span className="inline-flex items-center gap-xxs text-text-grey">
                                      開閉
                                      <ChevronRight className="h-3.5 w-3.5" />
                                    </span>
                                  </summary>
                                  <div className="border-t border-border px-s py-s">
                                    <ul className="flex flex-col gap-xs">
                                      {previous.map((version) => (
                                        <li
                                          key={version.id}
                                          className="rounded-s border border-border bg-white px-s py-s"
                                        >
                                          <div className="flex items-start justify-between gap-s">
                                            <div>
                                              <div className="flex items-center gap-xs">
                                                <span className="font-medium">
                                                  v{version.version}
                                                </span>
                                                <Badge tone="neutral">無効</Badge>
                                              </div>
                                              <p className="mt-xxs text-xs text-text-grey">
                                                {formatDate(version.created_at)} 登録
                                              </p>
                                            </div>
                                            <Link
                                              href={`/templates/${version.id}`}
                                              className="ui-link text-xs"
                                            >
                                              開く
                                            </Link>
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </details>
                              ) : (
                                <span className="text-xs text-text-grey">旧版なし</span>
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
                    <p className="text-text-grey">
                      最新版 {templateGroups.length} 件中 {(page - 1) * perPage + 1}〜
                      {Math.min(page * perPage, templateGroups.length)} 件
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
            )}
          </CardBody>
        </Card>
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
  search: {
    categoryId?: string;
    caseType?: string;
    areaId?: string;
    prefectureId?: string;
    municipalityId?: string;
    page?: string;
  };
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
  params.set("page", String(page));

  return (
    <Link
      href={`/templates?${params.toString()}`}
      className="rounded-s border border-border bg-white px-s py-xs hover:bg-grey-6"
    >
      {children}
    </Link>
  );
}
