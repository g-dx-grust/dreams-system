import { notFound } from "next/navigation";
import { getCaseFinancial } from "@/server/cases";
import { CaseFinancialTab } from "@/components/cases/case-financial-tab";

export default async function CaseFinancialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getCaseFinancial(Number(id));
  if (!res.ok) notFound();
  return <CaseFinancialTab caseId={Number(id)} financial={res.data} />;
}
