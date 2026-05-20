import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/permissions";
import { getTemplate, deactivateTemplate } from "@/server/templates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { caseTypeLabel } from "@/lib/format";
import { formatDate } from "@/lib/format";

export default async function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/templates");

  const { id } = await params;
  const result = await getTemplate(Number(id));
  if (!result.ok) notFound();

  const template = result.data;
  const mappingCount = template.mappings.length;
  const completeMappingCount = template.mappings.filter(
    (mapping) => mapping.placeholder.trim() && mapping.field_path.trim(),
  ).length;

  return (
    <>
      <PageHeader
        title={template.name}
        description={`${template.category.name} / v${template.version} / .${template.file_type}`}
        actions={
          <div className="flex gap-xs items-center">
            <Badge tone={template.is_active ? "success" : "neutral"}>
              {template.is_active ? "有効" : "無効"}
            </Badge>
            <Link
              href={`/templates/${template.id}/mapping`}
              className="inline-flex h-7 items-center justify-center rounded-s bg-main px-s text-s font-medium leading-tight text-white transition-colors hover:bg-main-hover"
            >
              マッピング作業画面を開く
            </Link>
            {template.is_active && (
              <form
                action={async () => {
                  "use server";
                  await deactivateTemplate(template.id);
                }}
              >
                <Button type="submit" variant="danger" size="sm">
                  無効化する
                </Button>
              </form>
            )}
            <Link
              href={`/templates/${template.id}/new-version`}
              className="inline-flex h-7 items-center justify-center rounded-s border border-border bg-white px-s text-s font-medium leading-tight text-text-black transition-colors hover:bg-grey-7"
            >
              新バージョンをアップロード
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-m">
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-s text-s">
              <div>
                <dt className="text-text-grey">カテゴリ</dt>
                <dd>{template.category.name}</dd>
              </div>
              <div>
                <dt className="text-text-grey">バージョン</dt>
                <dd>v{template.version}</dd>
              </div>
              <div>
                <dt className="text-text-grey">ファイル形式</dt>
                <dd>.{template.file_type}</dd>
              </div>
              <div>
                <dt className="text-text-grey">登録日</dt>
                <dd>{formatDate(template.created_at)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-text-grey">対象自治体</dt>
                <dd>
                  {template.location
                    ? `${template.location.area_name} / ${template.location.prefecture_name} / ${template.location.municipality_name}`
                    : "未設定"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-text-grey">対応案件種別</dt>
                <dd>
                  {template.applicable_case_types && template.applicable_case_types.length > 0 ? (
                    <div className="flex flex-wrap gap-xs mt-xs">
                      {template.applicable_case_types.map((ct) => (
                        <Badge key={ct} tone="info">
                          {caseTypeLabel(ct)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    "全案件種別（汎用）"
                  )}
                </dd>
              </div>
              {template.description && (
                <div className="col-span-2">
                  <dt className="text-text-grey">説明</dt>
                  <dd className="whitespace-pre-wrap">{template.description}</dd>
                </div>
              )}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>マッピング設定</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-m">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-xs">
                  <Badge tone={completeMappingCount === mappingCount ? "success" : "warning"}>
                    {completeMappingCount} / {mappingCount} 件完了
                  </Badge>
                  <Badge tone="neutral">
                    {template.file_type === "xlsx" ? "セル選択方式" : "差し込み名選択方式"}
                  </Badge>
                </div>
                <p className="mt-s text-s text-text-grey">
                  プレビューを大きく表示する専用画面で、転記場所とフィールドを設定します。
                </p>
              </div>
              <Link
                href={`/templates/${template.id}/mapping`}
                className="inline-flex h-8 items-center justify-center rounded-s bg-main px-m text-m font-medium leading-tight text-white transition-colors hover:bg-main-hover"
              >
                マッピング作業画面を開く
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
