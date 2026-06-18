import { PageHeader } from "@/components/ui/page-header";
import { getAllCasesForMap, getImportedCoordinatePoints } from "@/server/geo";
import { MapOverviewWorkspace } from "@/components/map/map-overview-workspace";

export default async function GlobalMapPage() {
  const [casesRes, pointsRes] = await Promise.all([
    getAllCasesForMap(),
    getImportedCoordinatePoints(),
  ]);
  const cases = casesRes.ok ? casesRes.data : [];
  const importedPoints = pointsRes.ok ? pointsRes.data : [];

  return (
    <>
      <PageHeader title="地図" description="案件マスタの座標をもとに全案件の位置を俯瞰します。" />
      <MapOverviewWorkspace cases={cases} importedPoints={importedPoints} />
    </>
  );
}
