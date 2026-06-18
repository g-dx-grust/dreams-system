import { notFound } from "next/navigation";
import { getCaseSummary } from "@/server/case-summary";
import { listDocuments } from "@/server/documents";
import { Card, CardBody } from "@/components/ui/card";
import { DocumentHistoryTable } from "@/components/documents/document-history-table";

export default async function CaseHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [caseResult, docsResult] = await Promise.all([
    getCaseSummary(Number(id)),
    listDocuments({ caseId: Number(id), perPage: 50 }),
  ]);
  if (!caseResult.ok) notFound();

  return (
    <Card>
      <CardBody className="p-0">
        {docsResult.ok ? (
          <DocumentHistoryTable items={docsResult.data.items} />
        ) : (
          <p className="text-s text-danger p-m">{docsResult.error}</p>
        )}
      </CardBody>
    </Card>
  );
}
