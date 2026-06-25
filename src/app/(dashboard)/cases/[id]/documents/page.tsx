import { notFound } from "next/navigation";
import { getCaseParcels } from "@/server/cases";
import { getCaseSummary } from "@/server/case-summary";
import { listTemplateGenerationOptions } from "@/server/templates";
import { DocumentGenerateForm } from "@/components/documents/document-generate-form";

export default async function CaseDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseId = Number(id);
  const caseResult = await getCaseSummary(caseId);
  if (!caseResult.ok) notFound();

  const parcelsResult = await getCaseParcels(caseId);
  const municipalityNames = parcelsResult.ok
    ? parcelsResult.data.map((parcel) => parcel.city ?? "")
    : [];
  const templatesResult = await listTemplateGenerationOptions({
    caseType: caseResult.data.case_type,
    municipalityNames,
  });
  const templates = templatesResult.ok ? templatesResult.data : [];
  const parcelCount = parcelsResult.ok ? parcelsResult.data.length : 0;

  return <DocumentGenerateForm caseId={caseId} templates={templates} parcelCount={parcelCount} />;
}
