import { notFound } from "next/navigation";
import { getCaseMap } from "@/server/geo";
import { MapWorkspace } from "@/components/map/map-workspace";

export default async function CaseMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getCaseMap(Number(id));
  if (!res.ok) notFound();
  return <MapWorkspace initialData={res.data} />;
}
