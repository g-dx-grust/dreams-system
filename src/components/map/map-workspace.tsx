"use client";

import dynamic from "next/dynamic";
import { type CaseMapPayload } from "@/lib/geo";

// MapLibre は window 依存のため SSR を無効化して動的読込する（Server Component からは
// ssr:false を指定できないので、この Client ラッパ経由で読み込む）。
// see: docs/gis-map-implementation-plan.md §5
const MapView = dynamic(() => import("./map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] items-center justify-center rounded-m border border-border text-text-grey">
      <span className="text-s">地図を読み込んでいます…</span>
    </div>
  ),
});

export function MapWorkspace({
  initialData,
}: {
  initialData: CaseMapPayload;
}) {
  return <MapView initialData={initialData} />;
}
