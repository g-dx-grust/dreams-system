import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getTemplate, getTemplatePreview } from "@/server/templates";
import { MappingEditor } from "@/components/templates/mapping-editor";
import { caseTypeLabel, formatDate } from "@/lib/format";

export default async function TemplateMappingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/templates");

  const { id } = await params;
  const templateId = Number(id);
  const [result, previewResult] = await Promise.all([
    getTemplate(templateId),
    getTemplatePreview(templateId),
  ]);
  if (!result.ok) notFound();

  const template = result.data;
  const location = template.location
    ? `${template.location.prefecture_name} / ${template.location.municipality_name}`
    : "自治体未設定";
  const caseTypes =
    template.applicable_case_types && template.applicable_case_types.length > 0
      ? template.applicable_case_types.map(caseTypeLabel).join("、")
      : "全案件種別";

  return (
    <MappingEditor
      templateId={template.id}
      templateName={template.name}
      templateMeta={`${template.category.name} / v${template.version} / .${template.file_type} / ${location} / ${caseTypes} / 登録日 ${formatDate(template.created_at)}`}
      backHref={`/templates/${template.id}`}
      initialMappings={template.mappings}
      fileType={template.file_type}
      initialPreview={previewResult.ok ? previewResult.data : null}
      initialPreviewError={previewResult.ok ? null : previewResult.error}
    />
  );
}
