import { notFound } from "next/navigation";
import { getCaseSummary } from "@/server/cases";
import { listTemplateGenerationOptions } from "@/server/templates";
import { DocumentGenerateForm } from "@/components/documents/document-generate-form";

export default async function CaseDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseResult = await getCaseSummary(Number(id));
  if (!caseResult.ok) notFound();

  const templatesResult = await listTemplateGenerationOptions(caseResult.data.case_type);
  const templates = templatesResult.ok ? templatesResult.data : [];

  return (
    <DocumentGenerateForm caseId={Number(id)} templates={templates} />
  );
}
