import { notFound } from "next/navigation";
import { getCaseParcels } from "@/server/cases";
import { CaseParcelsTab } from "@/components/cases/case-parcels-tab";

export default async function CaseParcelsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getCaseParcels(Number(id));
  if (!res.ok) notFound();
  return <CaseParcelsTab caseId={Number(id)} parcels={res.data} />;
}
