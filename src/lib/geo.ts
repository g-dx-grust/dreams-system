import { PREFECTURES } from "@/lib/prefectures";

/*
 * 地図（GIS）共通定数・型・ヘルパ。サーバ／クライアント双方から参照する純粋モジュール。
 * see: docs/gis-map-implementation-plan.md §3.2, §6
 */

// 案件の筆 1 件の地図用データ（RPC get_case_parcels_for_map の戻り 1 要素に対応）。
export type ParcelMapRow = {
  parcel_id: number;
  sort_order: number;
  pref: string | null;
  city: string | null;
  oaza: string | null;
  aza: string | null;
  chiban: string | null;
  chimoku: string | null;
  area: number | null;
  geo_status: string;
  lng: number | null;
  lat: number | null;
};

// 横断地図用の筆 1 件（RPC get_all_parcels_for_map の戻り 1 要素に対応）。
// geom IS NOT NULL の筆のみ返るため lng/lat は常に値を持つ。案件名/番号を併せ持つ。
export type ParcelOverviewRow = {
  parcel_id: number;
  case_id: number;
  case_number: string | null;
  case_name: string | null;
  pref: string | null;
  city: string | null;
  oaza: string | null;
  aza: string | null;
  chiban: string | null;
  geo_status: string;
  lng: number;
  lat: number;
};

// 案件地図の正本となる案件ピン。座標は cases.latitude / cases.longitude。
export type CaseMapRow = {
  id: number;
  case_number: string;
  case_name: string;
  latitude: number | null;
  longitude: number | null;
};

export type CaseMapPayload = {
  case: CaseMapRow;
  parcels: ParcelMapRow[];
};

// 横断地図用の案件ピン。座標が揃っている案件のみ返るため lng/lat は常に値を持つ。
export type CaseOverviewRow = {
  case_id: number;
  case_number: string;
  case_name: string;
  case_type: string;
  status: string;
  primary_address: string | null;
  parcel_count: number;
  lng: number;
  lat: number;
};

export type ImportedCoordinatePointRow = {
  id: number;
  source_file_name: string;
  point_name: string | null;
  latitude: number;
  longitude: number;
  memo: string | null;
  created_at: string;
};

// 国土地理院タイル。リアルタイム読込の Web 表示は申請不要・出典明示のみが義務。
// see: https://maps.gsi.go.jp/development/ichiran.html
export const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>';

export type GsiBaseLayerId = "pale" | "std" | "photo";

export type GsiBaseLayer = {
  id: GsiBaseLayerId;
  label: string;
  tiles: string[];
  maxzoom: number;
};

export const GSI_BASE_LAYERS: GsiBaseLayer[] = [
  {
    id: "pale",
    label: "淡色地図",
    tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
    maxzoom: 18,
  },
  {
    id: "std",
    label: "標準地図",
    tiles: ["https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"],
    maxzoom: 18,
  },
  {
    id: "photo",
    label: "写真",
    tiles: ["https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg"],
    maxzoom: 18,
  },
];

// 筆に座標が無い案件のフォールバック（日本全体）。
export const JAPAN_DEFAULT_CENTER: [number, number] = [138.0, 38.0];
export const JAPAN_DEFAULT_ZOOM = 4;
// 単一の筆へ寄るときのズーム。
export const PARCEL_FOCUS_ZOOM = 16;

// MapLibre の paint プロパティは色リテラル必須（Tailwind クラス／CSS 変数を渡せない）。
// 値はデザイントークン（MAIN=#3370FF / MAIN_DARKEN=#245BDB）に一致させている。
export const MAP_COLORS = {
  pin: "#3370FF",
  pinSelected: "#245BDB",
  parcelPin: "#646A73",
  importedPoint: "#FF8800",
  pinStroke: "#FFFFFF",
} as const;

export type GeoStatus = "unset" | "pinned" | "boundary" | "arbitrary";

export const GEO_STATUS_META: Record<
  GeoStatus,
  { label: string; tone: "neutral" | "info" | "success" | "warning" }
> = {
  unset: { label: "座標未設定", tone: "neutral" },
  pinned: { label: "ピン", tone: "success" },
  boundary: { label: "筆界", tone: "info" },
  arbitrary: { label: "任意座標", tone: "warning" },
};

export function geoStatusMeta(status: string) {
  return GEO_STATUS_META[status as GeoStatus] ?? GEO_STATUS_META.unset;
}

// muniCd(JIS 5桁) の先頭2桁 → 都道府県名。市区町村名は別表が必要なため P1 では未解決。
export function prefFromMuniCd(muniCd: string | null | undefined): string | null {
  if (!muniCd || muniCd.length < 2) return null;
  const code = Number.parseInt(muniCd.slice(0, 2), 10);
  if (!Number.isFinite(code) || code < 1 || code > PREFECTURES.length) return null;
  return PREFECTURES[code - 1] ?? null;
}

// 一覧/ポップアップ用の筆ラベル（大字＋字＋地番、無ければ「筆 #id」）。
export function parcelLabel(p: {
  parcel_id: number;
  oaza: string | null;
  aza: string | null;
  chiban: string | null;
}): string {
  const parts = [p.oaza, p.aza, p.chiban].filter((v): v is string => !!v && v.trim() !== "");
  return parts.length > 0 ? parts.join(" ") : `筆 #${p.parcel_id}`;
}

export function caseLabel(c: { case_number: string | null; case_name: string | null }): string {
  const parts = [c.case_number, c.case_name].filter((v): v is string => !!v && v.trim() !== "");
  return parts.length > 0 ? parts.join(" ") : "案件";
}

export function hasCaseCoordinates(c: CaseMapRow): c is CaseMapRow & {
  latitude: number;
  longitude: number;
} {
  return c.latitude != null && c.longitude != null;
}

const COORDINATE_NUMBER_PATTERN = /-?\d+(?:\.\d+)?/g;

function isLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

// 「34.769, 137.391」「137.391 34.769」「緯度34.769 経度137.391」を受け付ける。
export function parseCoordinateInput(input: string): { lat: number; lng: number } | null {
  const values = (input.match(COORDINATE_NUMBER_PATTERN) ?? [])
    .slice(0, 2)
    .map((value) => Number(value));
  const first = values[0];
  const second = values[1];
  if (first == null || second == null) return null;

  if (isLatitude(first) && isLongitude(second)) return { lat: first, lng: second };
  if (isLongitude(first) && isLatitude(second)) return { lat: second, lng: first };
  return null;
}
