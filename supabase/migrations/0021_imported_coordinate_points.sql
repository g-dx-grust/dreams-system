-- ================================================================
-- 座標CSV/Excel取り込み点
-- - 案件ピン（cases.latitude / cases.longitude）とは別の補助レイヤー
-- - 取り込み対象は世界測地系（JGD2011/WGS84相当）の緯度/経度のみ
-- see: docs/phase2/06_cases_master.md 座標CSV/Excel取り込み
-- ================================================================

CREATE TABLE IF NOT EXISTS public.imported_coordinate_points (
    id                  SERIAL PRIMARY KEY,
    source_file_name    TEXT NOT NULL,
    point_name          TEXT,
    latitude            DOUBLE PRECISION NOT NULL
        CHECK (latitude >= -90 AND latitude <= 90),
    longitude           DOUBLE PRECISION NOT NULL
        CHECK (longitude >= -180 AND longitude <= 180),
    memo                TEXT,
    imported_by_user_id UUID REFERENCES public.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.imported_coordinate_points IS 'CSV/Excelで取り込んだ基準点・測量点。案件ピンとは別の補助レイヤー';
COMMENT ON COLUMN public.imported_coordinate_points.latitude IS '点の緯度。世界測地系（JGD2011/WGS84相当）';
COMMENT ON COLUMN public.imported_coordinate_points.longitude IS '点の経度。世界測地系（JGD2011/WGS84相当）';

CREATE INDEX IF NOT EXISTS idx_imported_coordinate_points_coordinates
    ON public.imported_coordinate_points (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_imported_coordinate_points_created_at
    ON public.imported_coordinate_points (created_at DESC);

ALTER TABLE public.imported_coordinate_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imported_coordinate_points_select ON public.imported_coordinate_points;
DROP POLICY IF EXISTS imported_coordinate_points_insert ON public.imported_coordinate_points;
DROP POLICY IF EXISTS imported_coordinate_points_delete ON public.imported_coordinate_points;

CREATE POLICY imported_coordinate_points_select
    ON public.imported_coordinate_points
    FOR SELECT
    USING (public.is_active_user());

CREATE POLICY imported_coordinate_points_insert
    ON public.imported_coordinate_points
    FOR INSERT
    WITH CHECK (public.is_active_user());

CREATE POLICY imported_coordinate_points_delete
    ON public.imported_coordinate_points
    FOR DELETE
    USING (public.is_admin());
