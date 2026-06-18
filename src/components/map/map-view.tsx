"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  RasterTileSource,
  MapMouseEvent,
  Map as MlMap,
  Marker as MlMarker,
  StyleSpecification,
} from "maplibre-gl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { setCaseCoordinates, clearCaseCoordinates } from "@/server/geo";
import { useReverseGeocode, type ReverseGeocodeResult } from "@/hooks/use-reverse-geocode";
import {
  GSI_ATTRIBUTION,
  GSI_BASE_LAYERS,
  JAPAN_DEFAULT_CENTER,
  JAPAN_DEFAULT_ZOOM,
  MAP_COLORS,
  PARCEL_FOCUS_ZOOM,
  caseLabel,
  geoStatusMeta,
  hasCaseCoordinates,
  parcelLabel,
  type CaseMapPayload,
  type CaseMapRow,
  type GsiBaseLayer,
  type GsiBaseLayerId,
  type ParcelMapRow,
} from "@/lib/geo";
import { MapSearchBox } from "./map-search-box";
import { type AddressSearchResult } from "@/hooks/use-address-search";

type CaseFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { case_id: number };
};
type ParcelFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { parcel_id: number; label: string };
};
type PointFeatureCollection<TFeature> = { type: "FeatureCollection"; features: TFeature[] };

const CASE_SOURCE_ID = "case-pin";
const CASE_LAYER_ID = "case-pin";
const PARCEL_SOURCE_ID = "parcel-pins";
const PARCEL_LAYER_ID = "parcel-pins";
const BASE_SOURCE_ID = "gsi";

function buildStyle(layer: GsiBaseLayer): StyleSpecification {
  return {
    version: 8,
    sources: {
      [BASE_SOURCE_ID]: {
        type: "raster",
        tiles: layer.tiles,
        tileSize: 256,
        maxzoom: layer.maxzoom,
        attribution: GSI_ATTRIBUTION,
      },
    },
    layers: [{ id: BASE_SOURCE_ID, type: "raster", source: BASE_SOURCE_ID }],
  };
}

function toCaseFeatureCollection(
  c: CaseMapRow,
): PointFeatureCollection<CaseFeature> {
  if (!hasCaseCoordinates(c)) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [c.longitude, c.latitude] },
        properties: { case_id: c.id },
      },
    ],
  };
}

function toParcelFeatureCollection(
  rows: ParcelMapRow[],
): PointFeatureCollection<ParcelFeature> {
  return {
    type: "FeatureCollection",
    features: rows.flatMap((r): ParcelFeature[] => {
      if (r.lng == null || r.lat == null) return [];
      return [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [r.lng, r.lat] },
          properties: { parcel_id: r.parcel_id, label: parcelLabel(r) },
        },
      ];
    }),
  };
}

function fitToData(map: MlMap, c: CaseMapRow, parcels: ParcelMapRow[]) {
  if (hasCaseCoordinates(c)) {
    map.jumpTo({ center: [c.longitude, c.latitude], zoom: PARCEL_FOCUS_ZOOM });
    return;
  }

  const pts = parcels.filter((p) => p.lng != null && p.lat != null);
  if (pts.length === 0) return;
  if (pts.length === 1) {
    const only = pts[0];
    if (only?.lng != null && only.lat != null) {
      map.jumpTo({ center: [only.lng, only.lat], zoom: PARCEL_FOCUS_ZOOM });
    }
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  for (const p of pts) {
    if (p.lng != null && p.lat != null) bounds.extend([p.lng, p.lat]);
  }
  map.fitBounds(bounds, { padding: 64, maxZoom: PARCEL_FOCUS_ZOOM, duration: 0 });
}

export function MapView({ initialData }: { initialData: CaseMapPayload }) {
  const router = useRouter();
  const toast = useToast();
  const geocode = useReverseGeocode();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const previewMarkerRef = useRef<MlMarker | null>(null);
  const dataRef = useRef<CaseMapPayload>(initialData);
  const placingRef = useRef(false);
  const clickRef = useRef<(e: MapMouseEvent) => void>(() => {});

  const [loaded, setLoaded] = useState(false);
  const [baseLayer, setBaseLayer] = useState<GsiBaseLayerId>("pale");
  const [placing, setPlacing] = useState(false);
  const [selectedParcelId, setSelectedParcelId] = useState<number | null>(null);
  const [pending, setPending] = useState<{ lng: number; lat: number } | null>(null);
  const [hint, setHint] = useState<ReverseGeocodeResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const caseInfo = initialData.case;
  const parcels = initialData.parcels;
  const caseHasCoordinates = hasCaseCoordinates(caseInfo);
  const unsetParcelCount = parcels.filter((p) => p.lng == null || p.lat == null).length;

  const showPreviewMarker = useCallback((lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (previewMarkerRef.current) {
      previewMarkerRef.current.setLngLat([lng, lat]);
    } else {
      previewMarkerRef.current = new maplibregl.Marker({ color: MAP_COLORS.pinSelected })
        .setLngLat([lng, lat])
        .addTo(map);
    }
  }, []);

  const clearPreviewMarker = useCallback(() => {
    previewMarkerRef.current?.remove();
    previewMarkerRef.current = null;
  }, []);

  useEffect(() => {
    clickRef.current = (e: MapMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;

      if (placingRef.current) {
        const { lng, lat } = e.lngLat;
        setPending({ lng, lat });
        setActionError(null);
        setHint(null);
        showPreviewMarker(lng, lat);
        void geocode.lookup(lng, lat).then((r) => {
          if (placingRef.current) setHint(r);
        });
        return;
      }

      if (map.getLayer(CASE_LAYER_ID)) {
        const caseHits = map.queryRenderedFeatures(e.point, { layers: [CASE_LAYER_ID] });
        const hit = caseHits[0];
        if (hit?.properties) {
          router.push(`/cases/${dataRef.current.case.id}`);
          return;
        }
      }

      if (!map.getLayer(PARCEL_LAYER_ID)) return;
      const parcelHits = map.queryRenderedFeatures(e.point, { layers: [PARCEL_LAYER_ID] });
      const parcelHit = parcelHits[0];
      if (parcelHit?.properties) {
        const parcelId = Number(parcelHit.properties.parcel_id);
        if (Number.isFinite(parcelId)) setSelectedParcelId(parcelId);
      }
    };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: buildStyle(GSI_BASE_LAYERS[0]!),
      center: JAPAN_DEFAULT_CENTER,
      zoom: JAPAN_DEFAULT_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
    map.on("click", (e) => clickRef.current(e));

    map.on("load", () => {
      map.addSource(PARCEL_SOURCE_ID, {
        type: "geojson",
        data: toParcelFeatureCollection(dataRef.current.parcels),
      });
      map.addLayer({
        id: PARCEL_LAYER_ID,
        type: "circle",
        source: PARCEL_SOURCE_ID,
        paint: {
          "circle-radius": 5,
          "circle-color": MAP_COLORS.parcelPin,
          "circle-opacity": 0.75,
          "circle-stroke-color": MAP_COLORS.pinStroke,
          "circle-stroke-width": 1,
        },
      });

      map.addSource(CASE_SOURCE_ID, {
        type: "geojson",
        data: toCaseFeatureCollection(dataRef.current.case),
      });
      map.addLayer({
        id: CASE_LAYER_ID,
        type: "circle",
        source: CASE_SOURCE_ID,
        paint: {
          "circle-radius": 8,
          "circle-color": MAP_COLORS.pin,
          "circle-stroke-color": MAP_COLORS.pinStroke,
          "circle-stroke-width": 2,
        },
      });

      map.on("mouseenter", CASE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", CASE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", PARCEL_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", PARCEL_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });

      setLoaded(true);
      fitToData(map, dataRef.current.case, dataRef.current.parcels);
    });

    return () => {
      clearPreviewMarker();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    dataRef.current = initialData;
    const map = mapRef.current;
    if (!map || !loaded) return;
    const caseSource = map.getSource(CASE_SOURCE_ID) as GeoJSONSource | undefined;
    caseSource?.setData(toCaseFeatureCollection(initialData.case));
    const parcelSource = map.getSource(PARCEL_SOURCE_ID) as GeoJSONSource | undefined;
    parcelSource?.setData(toParcelFeatureCollection(initialData.parcels));
  }, [initialData, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const layer = GSI_BASE_LAYERS.find((l) => l.id === baseLayer) ?? GSI_BASE_LAYERS[0]!;
    const src = map.getSource(BASE_SOURCE_ID) as RasterTileSource | undefined;
    src?.setTiles(layer.tiles);
  }, [baseLayer, loaded]);

  useEffect(() => {
    placingRef.current = placing;
  }, [placing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || selectedParcelId == null) return;
    const selected = parcels.find((p) => p.parcel_id === selectedParcelId);
    if (selected?.lng != null && selected.lat != null) {
      map.flyTo({
        center: [selected.lng, selected.lat],
        zoom: Math.max(map.getZoom(), PARCEL_FOCUS_ZOOM),
        duration: 600,
      });
    }
  }, [selectedParcelId, loaded, parcels]);

  const startPlacing = () => {
    setActionError(null);
    setPending(null);
    setHint(null);
    clearPreviewMarker();
    geocode.reset();
    setPlacing(true);
  };

  const cancelPlacing = useCallback(() => {
    setPlacing(false);
    setPending(null);
    setHint(null);
    clearPreviewMarker();
    geocode.reset();
  }, [clearPreviewMarker, geocode]);

  const confirmPin = async () => {
    if (!pending) return;
    setSaving(true);
    setActionError(null);
    const res = await setCaseCoordinates(caseInfo.id, pending.lng, pending.lat);
    setSaving(false);
    if (!res.ok) {
      setActionError(res.error);
      toast({ message: res.error, tone: "danger" });
      return;
    }
    toast({ message: "案件ピンを保存しました", tone: "success" });
    cancelPlacing();
    router.refresh();
  };

  const confirmClear = async () => {
    setClearing(true);
    setActionError(null);
    const res = await clearCaseCoordinates(caseInfo.id);
    setClearing(false);
    setClearOpen(false);
    if (!res.ok) {
      setActionError(res.error);
      toast({ message: res.error, tone: "danger" });
      return;
    }
    toast({ message: "案件ピンを解除しました", tone: "success" });
    router.refresh();
  };

  const moveToCasePin = () => {
    const map = mapRef.current;
    if (!map || !hasCaseCoordinates(caseInfo)) return;
    map.flyTo({
      center: [caseInfo.longitude, caseInfo.latitude],
      zoom: Math.max(map.getZoom(), PARCEL_FOCUS_ZOOM),
      duration: 600,
    });
  };

  const handleSearchSelect = (r: AddressSearchResult) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [r.lng, r.lat],
      zoom: Math.max(map.getZoom(), PARCEL_FOCUS_ZOOM),
      duration: 800,
    });
  };

  return (
    <div className="flex flex-col gap-m lg:flex-row">
      <div className="relative h-[70vh] w-full overflow-hidden rounded-m border border-border lg:flex-1">
        <div ref={containerRef} className="h-full w-full" aria-label="案件の地図" role="application" />

        <div className="absolute left-s top-s z-10 flex flex-col gap-s">
          <MapSearchBox onSelect={handleSearchSelect} />
          <div className="flex w-fit overflow-hidden rounded-s border border-border bg-white shadow-s">
            {GSI_BASE_LAYERS.map((l) => {
              const active = baseLayer === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setBaseLayer(l.id)}
                  aria-pressed={active}
                  className={`px-s py-xs text-s ${
                    active ? "bg-main text-white" : "bg-white text-text-grey hover:bg-grey-7"
                  }`}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>

        {placing && (
          <div className="absolute inset-x-s top-s z-10 mx-auto w-fit rounded-s border border-main bg-white px-m py-xs text-s text-text-black shadow-s">
            地図をクリックして案件ピンの位置を指定してください
          </div>
        )}
      </div>

      <aside className="flex flex-col gap-m lg:w-80">
        {actionError && (
          <div
            role="alert"
            className="rounded-s border border-danger bg-danger-soft p-s text-s text-danger"
          >
            {actionError}
          </div>
        )}

        <div className="rounded-m border border-border bg-white p-m">
          <div className="flex items-start justify-between gap-s">
            <div className="min-w-0">
              <p className="truncate text-s font-semibold text-text-black">
                {caseLabel(caseInfo)}
              </p>
              <p className="mt-xs text-xs text-text-grey">案件マスタの座標を地図表示の正本にします。</p>
            </div>
            <Badge tone={caseHasCoordinates ? "success" : "neutral"}>
              {caseHasCoordinates ? "座標設定済" : "座標未設定"}
            </Badge>
          </div>

          {caseHasCoordinates ? (
            <p className="mt-s text-s tabular-nums text-text-grey">
              緯度 {caseInfo.latitude.toFixed(6)} ／ 経度 {caseInfo.longitude.toFixed(6)}
            </p>
          ) : (
            <p className="mt-s text-s text-text-grey">
              座標未設定の案件です。任意座標の現場でも、地図クリックで代表位置を保存できます。
            </p>
          )}

          <div className="mt-s flex flex-wrap gap-s">
            {caseHasCoordinates && (
              <Button variant="secondary" size="sm" onClick={moveToCasePin}>
                地図で確認
              </Button>
            )}
            <Button variant={placing ? "primary" : "secondary"} size="sm" onClick={startPlacing}>
              {placing ? "クリックで指定中…" : caseHasCoordinates ? "位置を変更する" : "地図で設定する"}
            </Button>
            {caseHasCoordinates && (
              <Button variant="text" size="sm" onClick={() => setClearOpen(true)}>
                ピン解除
              </Button>
            )}
          </div>
        </div>

        {pending && (
          <div className="rounded-m border border-main bg-main-soft p-m">
            <p className="text-s font-medium text-text-black">この地点を案件ピンとして保存</p>
            <p className="mt-xs text-s tabular-nums text-text-grey">
              緯度 {pending.lat.toFixed(6)} ／ 経度 {pending.lng.toFixed(6)}
            </p>
            {geocode.isLoading && <p className="mt-xs text-s text-text-grey">住所を取得中…</p>}
            {!geocode.isLoading && geocode.error && (
              <p className="mt-xs text-s text-text-grey">{geocode.error}</p>
            )}
            {!geocode.isLoading && !geocode.error && hint && (hint.pref || hint.town) && (
              <p className="mt-xs text-s text-text-grey">
                付近: {[hint.pref, hint.town].filter(Boolean).join(" ")}
              </p>
            )}
            <div className="mt-s flex gap-s">
              <Button size="sm" loading={saving} loadingLabel="保存中…" onClick={confirmPin}>
                この位置で保存する
              </Button>
              <Button size="sm" variant="text" onClick={cancelPlacing}>
                キャンセル
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-s border border-border bg-grey-6 p-s text-s text-text-grey">
          土地情報 {parcels.length} 件 / 筆代表点未設定 {unsetParcelCount} 件
        </div>

        {parcels.length === 0 ? (
          <p className="text-s text-text-grey">
            この案件には土地情報が登録されていません。「土地情報」タブで筆を追加してください。
          </p>
        ) : (
          <ul className="flex max-h-[36vh] flex-col gap-s overflow-y-auto">
            {parcels.map((p) => {
              const meta = geoStatusMeta(p.geo_status);
              const hasPin = p.lng != null && p.lat != null;
              const selected = selectedParcelId === p.parcel_id;
              return (
                <li
                  key={p.parcel_id}
                  className={`rounded-s border p-s ${
                    selected ? "border-main bg-main-soft" : "border-border bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-s">
                    <button
                      type="button"
                      onClick={() => setSelectedParcelId(p.parcel_id)}
                      className="truncate text-left text-s text-text-black"
                    >
                      {parcelLabel(p)}
                    </button>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  {hasPin && (
                    <div className="mt-xs">
                      <Button variant="text" size="sm" onClick={() => setSelectedParcelId(p.parcel_id)}>
                        筆代表点へ移動
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-s text-text-grey">
          背景地図は地理院タイル（出典は地図右下に常時表示）。住所・地番は補助情報として保持します。
        </p>
      </aside>

      <ConfirmDialog
        open={clearOpen}
        title="案件ピンを解除しますか？"
        description="案件マスタの緯度/経度を空にします。住所・土地情報は残ります。"
        confirmLabel="解除する"
        tone="danger"
        loading={clearing}
        onConfirm={() => void confirmClear()}
        onCancel={() => setClearOpen(false)}
      />
    </div>
  );
}
