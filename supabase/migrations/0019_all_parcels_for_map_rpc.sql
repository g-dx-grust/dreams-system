-- ================================================================
-- 地図（GIS）横断ビュー: 全案件の座標付き筆を1枚の地図用に取得する RPC
-- - 既存 get_case_parcels_for_map と同方針：SECURITY DEFINER ＋冒頭 is_active_user() 検査、
--   ST_* は extensions スキーマにあるため search_path に extensions を含める。
-- - geom が NULL（座標未確定）の筆は地図に乗らないため除外。案件名/番号を併せて返し
--   クリック時のポップアップと案件詳細への導線に使う。
-- see: docs/gis-map-implementation-plan.md §10
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_all_parcels_for_map()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'parcel_id',   p.id,
                'case_id',     p.case_id,
                'case_number', c.case_number,
                'case_name',   c.case_name,
                'pref',        p.pref,
                'city',        p.city,
                'oaza',        p.oaza,
                'aza',         p.aza,
                'chiban',      p.chiban,
                'geo_status',  p.geo_status,
                'lng',         ST_X(p.geom),
                'lat',         ST_Y(p.geom)
            )
            ORDER BY p.case_id, p.sort_order, p.id
        ),
        '[]'::JSONB
    )
    INTO v_result
    FROM public.case_parcels p
    JOIN public.cases c ON c.id = p.case_id
    WHERE p.geom IS NOT NULL;

    RETURN v_result;
END;
$$;
