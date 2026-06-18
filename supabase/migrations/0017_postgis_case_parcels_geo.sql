-- ================================================================
-- 地図（GIS）機能 基盤: PostGIS 有効化と case_parcels への座標列追加
-- - PostGIS は専用 extensions スキーマへ導入（public を汚さない／空間関数を
--   PostgREST に露出させない。pg_trgm は public 直下だが PostGIS は関数数が
--   桁違いに多いため隔離する）
-- - case_parcels に代表点(geom)・筆界(boundary)・座標ステータス(geo_status)を追加
--   いずれも NULL 許容＝任意座標・未測量の筆も従来どおり登録できる
-- - 座標は WGS84 / EPSG:4326 で保存（MapLibre・GeoJSON・地理院タイルと整合）
-- see: docs/gis-map-implementation-plan.md §4（P0 基盤）
-- ================================================================

-- ---- Extensions ----
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- ---- 筆（case_parcels）への座標列追加 ----
-- NOT NULL + 定数 DEFAULT の列追加は PG11+ ではメタデータ操作のみ（テーブル書き換えなし）
ALTER TABLE public.case_parcels
    ADD COLUMN IF NOT EXISTS geom       extensions.geometry(Point,   4326),
    ADD COLUMN IF NOT EXISTS boundary   extensions.geometry(Polygon, 4326),
    ADD COLUMN IF NOT EXISTS geo_status TEXT NOT NULL DEFAULT 'unset'
        CHECK (geo_status IN ('unset', 'pinned', 'boundary', 'arbitrary'));

COMMENT ON COLUMN public.case_parcels.geom       IS '代表点（手動ピン）。WGS84/EPSG:4326';
COMMENT ON COLUMN public.case_parcels.boundary   IS '筆界ポリゴン。WGS84/EPSG:4326（将来: 法務省データ突合で投入）';
COMMENT ON COLUMN public.case_parcels.geo_status IS 'unset=未設定 / pinned=手動ピン / boundary=筆界あり / arbitrary=任意座標(地図に乗らない)';

-- ---- 空間インデックス（GIST 必須。gist_geometry_ops_2d は geometry 型の既定演算子クラス）----
CREATE INDEX IF NOT EXISTS idx_case_parcels_geom     ON public.case_parcels USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_case_parcels_boundary ON public.case_parcels USING GIST (boundary);
