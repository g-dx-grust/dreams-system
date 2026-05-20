import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPerson } from "@/server/persons";
import { casePersonRoleLabel } from "@/lib/format";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getPerson(Number(id));
  if (!res.ok) notFound();
  const p = res.data;

  const addressFull = [
    p.address_pref,
    p.address_city,
    p.address_town,
    p.address_line1,
    p.address_line2,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <PageHeader
        title={p.name}
        description={p.name_kana ?? undefined}
        actions={
          <>
            <Link href="/persons">
              <Button variant="secondary">一覧へ戻る</Button>
            </Link>
            <Link href={`/persons/${p.id}/edit`}>
              <Button>編集する</Button>
            </Link>
          </>
        }
      />

      <Card>
        <CardBody className="flex flex-col gap-m">
          <DetailRow label="区分">
            <Badge tone={p.person_type === "corporation" ? "info" : "neutral"}>
              {p.person_type === "corporation" ? "法人" : "個人"}
            </Badge>
          </DetailRow>

          <DetailRow label="案件での既定役割">
            {p.default_case_role ? (
              <Badge tone="info">{casePersonRoleLabel(p.default_case_role)}</Badge>
            ) : (
              "—"
            )}
          </DetailRow>

          <DetailRow label="郵便番号">{formatZip(p.zip)}</DetailRow>
          <DetailRow label="住所">{addressFull || "—"}</DetailRow>
          <DetailRow label="電話番号">{p.phone ?? "—"}</DetailRow>
          <DetailRow label="FAX番号">{p.fax ?? "—"}</DetailRow>
          <DetailRow label="メールアドレス">{p.email ?? "—"}</DetailRow>

          {p.person_type === "corporation" && (
            <>
              <DetailRow label="法人番号">{p.corporate_number ?? "—"}</DetailRow>
              <DetailRow label="代表者氏名">{p.representative_name ?? "—"}</DetailRow>
            </>
          )}

          {p.memo && (
            <DetailRow label="メモ">
              <p className="whitespace-pre-wrap">{p.memo}</p>
            </DetailRow>
          )}

          <DetailRow label="登録日">
            {new Date(p.created_at).toLocaleString("ja-JP")}
          </DetailRow>
          <DetailRow label="更新日">
            {new Date(p.updated_at).toLocaleString("ja-JP")}
          </DetailRow>
        </CardBody>
      </Card>
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-xs sm:grid-cols-[160px_1fr] sm:gap-m">
      <p className="text-s font-medium text-text-grey">{label}</p>
      <div className="text-m text-text-black">{children}</div>
    </div>
  );
}

function formatZip(zip: string | null): string {
  if (!zip) return "—";
  const clean = zip.replace(/-/g, "");
  if (clean.length !== 7) return zip;
  return `〒${clean.slice(0, 3)}-${clean.slice(3)}`;
}
