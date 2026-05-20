import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listDocuments } from "@/server/documents";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { DocumentHistoryTable } from "@/components/documents/document-history-table";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const result = await listDocuments({ page });

  return (
    <>
      <PageHeader
        title="帳票履歴"
        description="生成済み帳票の一覧とダウンロード"
      />
      <Card>
        <CardBody className="p-0">
          {result.ok ? (
            <DocumentHistoryTable items={result.data.items} showCaseNumber />
          ) : (
            <p className="text-s text-danger p-m">{result.error}</p>
          )}
        </CardBody>
      </Card>
    </>
  );
}
