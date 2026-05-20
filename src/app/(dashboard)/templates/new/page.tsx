import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { getTemplateReferenceData } from "@/server/templates";
import { PageHeader } from "@/components/ui/page-header";
import { TemplateUploadForm } from "@/components/templates/template-upload-form";

export default async function NewTemplatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/templates");

  const result = await getTemplateReferenceData();
  const categories = result.ok ? result.data.categories : [];
  const locationAreas = result.ok ? result.data.locationAreas : [];

  return (
    <>
      <PageHeader
        title="テンプレートをアップロード"
        description="様式ファイル（.docx / .xlsx）を登録します"
      />
      <TemplateUploadForm categories={categories} locationAreas={locationAreas} />
    </>
  );
}
