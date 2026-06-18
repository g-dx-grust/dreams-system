"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  RasterTileSource,
  MapMouseEvent,
  Map as MlMap,
  StyleSpecification,
} from "maplibre-gl";
import { Badge } from "@/components/ui/badge";
import {
  GSI_ATTRIBUTION,
  GSI_BASE_LAYERS,
  JAPAN_DEFAULT_CENTER,
  JAPAN_DEFAULT_ZOOM,
  MAP_COLORS,
  PARCEL_FOCUS_ZOOM,
  caseLabel,
  type CaseOverviewRow,
  type GsiBaseLayer,
  type GsiBaseLayerId,
  type ImportedCoordinatePointRow,
} from "@/lib/geo";
import { caseStatusTone, caseTypeLabel, caseStatusLabel } from "@/lib/format";
import { MapSearchBox } from "./map-search-box";
import { CoordinateImportForm } from "./coordinate-import-form";
import { type AddressSearchResult } from "@/hooks/use-address-search";

type CaseFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { case_id: number };
};
type ImportedPointFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { point_id: number };
};
type CaseFeatureCollection = { type: "FeatureCollection"; features: CaseFeature[] };
type ImportedPointFeatureCollection = {
  type: "FeatureCollection";
  features: ImportedPointFeature[];
};

const CASE_SOURCE_ID = "cases-overview";
const CASE_LAYER_ID = "cases-overview-pin";
const CASE_SELECTED_LAYER_ID = "cases-overview-selected";
const IMPORTED_SOURCE_ID = "imported-coordinate-points";
const IMPORTED_LAYER_ID = "imported-coordinate-points";
const IMPORTED_SELECTED_LAYER_ID = "imported-coordinate-points-selected";
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

function toCaseFeatureCollection(rows: CaseOverviewRow[]): CaseFeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      properties: { case_id: r.case_id },
    })),
  };
}

function toImportedPointFeatureCollection(
  rows: ImportedCoordinatePointRow[],
): ImportedPointFeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
      properties: { point_id: r.id },
    })),
  };
}

function fitToMapData(
  map: MlMap,
  cases: CaseOverviewRow[],
  importedPoints: ImportedCoordinatePointRow[],
) {
  const points = [
    ...cases.map((row) => ({ lng: row.lng, lat: row.lat })),
    ...importedPoints.map((row) => ({ lng: row.longitude, lat: row.latitude })),
  ];
  if (points.length === 0) return;
  if (points.length === 1) {
    const only = points[0]!;
    map.jumpTo({ center: [only.lng, only.lat], zoom: PARCEL_FOCUS_ZOOM });
    return;
  }
  const bounds = new maplibregl.LngLatBounds();
  for (const p of points) bounds.extend([p.lng, p.lat]);
  map.fitBounds(bounds, { padding: 64, maxZoom: PARCEL_FOCUS_ZOOM, duration: 0 });
}

export function MapOverview({
  cases,
  importedPoints,
}: {
  cases: CaseOverviewRow[];
  importedPoints: ImportedCoordinatePointRow[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const casesRef = useRef<CaseOverviewRow[]>(cases);
  const importedPointsRef = useRef<ImportedCoordinatePointRow[]>(importedPoints);
  const clickRef = useRef<(e: MapMouseEvent) => void>(() => {});

  const [loaded, setLoaded] = useState(false);
  const [baseLayer, setBaseLayer] = useState<GsiBaseLayerId>("pale");
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim().toLowerCase();
  const filtered = trimmedQuery
    ? cases.filter((c) =>
        [
          c.case_number,
          c.case_name,
          c.case_type,
          c.status,
          c.primary_address,
        ]
          .filter((v): v is string => !!v)
          .join(" ")
          .toLowerCase()
          .includes(trimmedQuery),
      )
    : cases;
  const filteredImportedPoints = trimmedQuery
    ? importedPoints.filter((point) =>
        [point.point_name, point.source_file_name, point.memo]
          .filter((v): v is string => !!v)
          .join(" ")
          .toLowerCase()
          .includes(trimmedQuery),
      )
    : importedPoints;

  useEffect(() => {
    clickRef.current = (e: MapMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;
      if (map.getLayer(CASE_LAYER_ID)) {
        const caseHits = map.queryRenderedFeatures(e.point, { layers: [CASE_LAYER_ID] });
        const hit = caseHits[0];
        if (hit?.properties) {
          const caseId = Number(hit.properties.case_id);
          if (Number.isFinite(caseId)) {
            setSelectedCaseId(caseId);
            setSelectedPointId(null);
            return;
          }
        }
      }
      if (map.getLayer(IMPORTED_LAYER_ID)) {
        const pointHits = map.queryRenderedFeatures(e.point, { layers: [IMPORTED_LAYER_ID] });
        const hit = pointHits[0];
        if (hit?.properties) {
          const pointId = Number(hit.properties.point_id);
          if (Number.isFinite(pointId)) {
            setSelectedPointId(pointId);
            setSelectedCaseId(null);
          }
        }
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
      map.addSource(CASE_SOURCE_ID, {
        type: "geojson",
        data: toCaseFeatureCollection(casesRef.current),
      });
      map.addLayer({
        id: CASE_LAYER_ID,
        type: "circle",
        source: CASE_SOURCE_ID,
        paint: {
          "circle-radius": 7,
          "circle-color": MAP_COLORS.pin,
          "circle-stroke-color": MAP_COLORS.pinStroke,
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: CASE_SELECTED_LAYER_ID,
        type: "circle",
        source: CASE_SOURCE_ID,
        filter: ["==", ["get", "case_id"], -1],
        paint: {
          "circle-radius": 9,
          "circle-color": MAP_COLORS.pinSelected,
          "circle-stroke-color": MAP_COLORS.pinStroke,
          "circle-stroke-width": 3,
        },
      });
      map.addSource(IMPORTED_SOURCE_ID, {
        type: "geojson",
        data: toImportedPointFeatureCollection(importedPointsRef.current),
      });
      map.addLayer({
        id: IMPORTED_LAYER_ID,
        type: "circle",
        source: IMPORTED_SOURCE_ID,
        paint: {
          "circle-radius": 5,
          "circle-color": MAP_COLORS.importedPoint,
          "circle-stroke-color": MAP_COLORS.pinStroke,
          "circle-stroke-width": 1,
        },
      });
      map.addLayer({
        id: IMPORTED_SELECTED_LAYER_ID,
        type: "circle",
        source: IMPORTED_SOURCE_ID,
        filter: ["==", ["get", "point_id"], -1],
        paint: {
          "circle-radius": 7,
          "circle-color": MAP_COLORS.importedPoint,
          "circle-stroke-color": MAP_COLORS.pinStroke,
          "circle-stroke-width": 3,
        },
      });
      map.on("mouseenter", CASE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", CASE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", IMPORTED_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", IMPORTED_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });
      setLoaded(true);
      fitToMapData(map, casesRef.current, importedPointsRef.current);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    casesRef.current = cases;
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource(CASE_SOURCE_ID) as GeoJSONSource | undefined;
    src?.setData(toCaseFeatureCollection(cases));
  }, [cases, loaded]);

  useEffect(() => {
    importedPointsRef.current = importedPoints;
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource(IMPORTED_SOURCE_ID) as GeoJSONSource | undefined;
    src?.setData(toImportedPointFeatureCollection(importedPoints));
  }, [importedPoints, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const layer = GSI_BASE_LAYERS.find((l) => l.id === baseLayer) ?? GSI_BASE_LAYERS[0]!;
    const src = map.getSource(BASE_SOURCE_ID) as RasterTileSource | undefined;
    src?.setTiles(layer.tiles);
  }, [baseLayer, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (map.getLayer(CASE_SELECTED_LAYER_ID)) {
      map.setFilter(CASE_SELECTED_LAYER_ID, ["==", ["get", "case_id"], selectedCaseId ?? -1]);
    }
    if (map.getLayer(IMPORTED_SELECTED_LAYER_ID)) {
      map.setFilter(IMPORTED_SELECTED_LAYER_ID, ["==", ["get", "point_id"], selectedPointId ?? -1]);
    }
    if (selectedCaseId != null) {
      const selected = cases.find((c) => c.case_id === selectedCaseId);
      if (selected) {
        map.flyTo({
          center: [selected.lng, selected.lat],
          zoom: Math.max(map.getZoom(), PARCEL_FOCUS_ZOOM),
          duration: 600,
        });
      }
    }
    if (selectedPointId != null) {
      const selected = importedPoints.find((point) => point.id === selectedPointId);
      if (selected) {
        map.flyTo({
          center: [selected.longitude, selected.latitude],
          zoom: Math.max(map.getZoom(), PARCEL_FOCUS_ZOOM),
          duration: 600,
        });
      }
    }
  }, [selectedCaseId, selectedPointId, loaded, cases, importedPoints]);

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
        <div
          ref={containerRef}
          className="h-full w-full"
          aria-label="全案件の地図"
          role="application"
        />

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
      </div>

      <aside className="flex flex-col gap-m lg:w-80">
        <div className="rounded-s border border-border bg-grey-6 p-s text-s text-text-grey tabular-nums">
          案件 {cases.length} 件 / 取り込み点 {importedPoints.length} 件
        </div>
        <CoordinateImportForm />
        {(cases.length > 0 || importedPoints.length > 0) && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="案件名・住所・点名で絞り込み"
            aria-label="案件名・住所・点名で絞り込み"
            className="rounded-s border border-border bg-white px-s py-xs text-s text-text-black outline-none placeholder:text-text-grey focus:border-main"
          />
        )}

        {cases.length === 0 ? (
          <p className="text-s text-text-grey">
            地図に表示できる案件がまだありません。案件詳細の「地図」タブで案件ピンを保存すると、ここに表示されます。
          </p>
        ) : (
          <>
            {filtered.length === 0 ? (
              <p className="text-s text-text-grey">一致する案件がありません。</p>
            ) : (
              <ul className="flex max-h-[48vh] flex-col gap-s overflow-y-auto">
                {filtered.map((c) => {
                  const isSelected = selectedCaseId === c.case_id;
                  return (
                    <li
                      key={c.case_id}
                      className={`rounded-s border p-s ${
                        isSelected ? "border-main bg-main-soft" : "border-border bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCaseId(c.case_id);
                          setSelectedPointId(null);
                        }}
                        className="block w-full text-left"
                      >
                        <span className="block truncate text-s font-medium text-text-black">
                          {caseLabel(c)}
                        </span>
                        <span className="mt-xs flex flex-wrap items-center gap-xs">
                          <Badge tone="info">{caseTypeLabel(c.case_type)}</Badge>
                          <Badge tone={caseStatusTone(c.status)}>
                            {caseStatusLabel(c.status)}
                          </Badge>
                        </span>
                        {c.primary_address && (
                          <span className="mt-xs block truncate text-s text-text-grey">
                            {c.primary_address}
                          </span>
                        )}
                        <span className="mt-xs block text-xs text-text-grey tabular-nums">
                          土地情報 {c.parcel_count} 件
                        </span>
                      </button>
                      {isSelected && (
                        <div className="mt-s flex gap-s">
                          <Link
                            href={`/cases/${c.case_id}`}
                            className="text-s text-main hover:underline"
                          >
                            案件詳細を開く
                          </Link>
                          <Link
                            href={`/cases/${c.case_id}/map`}
                            className="text-s text-text-grey hover:underline"
                          >
                            地図タブ
                          </Link>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {importedPoints.length > 0 && (
          <div className="flex flex-col gap-s">
            <p className="text-s font-semibold text-text-black">取り込み点</p>
            {filteredImportedPoints.length === 0 ? (
              <p className="text-s text-text-grey">一致する取り込み点がありません。</p>
            ) : (
              <ul className="flex max-h-[28vh] flex-col gap-s overflow-y-auto">
                {filteredImportedPoints.map((point) => {
                  const isSelected = selectedPointId === point.id;
                  return (
                    <li
                      key={point.id}
                      className={`rounded-s border p-s ${
                        isSelected ? "border-warning bg-warning-soft" : "border-border bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPointId(point.id);
                          setSelectedCaseId(null);
                        }}
                        className="block w-full text-left"
                      >
                        <span className="block truncate text-s font-medium text-text-black">
                          {point.point_name ?? `座標点 #${point.id}`}
                        </span>
                        <span className="mt-xs block truncate text-xs text-text-grey">
                          {point.source_file_name}
                        </span>
                        <span className="mt-xs block text-xs text-text-grey tabular-nums">
                          緯度 {point.latitude.toFixed(6)} / 経度 {point.longitude.toFixed(6)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <p className="text-s text-text-grey">
          背景地図は地理院タイル（出典は地図右下に常時表示）。案件ピンは案件マスタの座標です。
        </p>
      </aside>
    </div>
  );
}
