import { notFound } from "next/navigation";
import { getCasePersons } from "@/server/cases";
import { CasePersonsTab } from "@/components/cases/case-persons-tab";

export default async function CasePersonsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getCasePersons(Number(id));
  if (!res.ok) notFound();

  return (
    <CasePersonsTab
      caseId={Number(id)}
      persons={res.data.persons}
      currentMaster={res.data.currentMasterByPersonId}
    />
  );
}
