-- ================================================================
-- 地図（GIS）P1: 案件の筆の座標 取得 / ピン留め / 解除 RPC
-- - PostGIS 関数(ST_*)は extensions スキーマにあるため search_path に extensions を含める
--   （既存 RPC は public のみ。地図系は extensions を追加する）
-- - 既存パターン踏襲: SECURITY DEFINER + 冒頭で public.is_active_user() を検査
-- see: docs/gis-map-implementation-plan.md §5, §6C
-- ================================================================

-- 案件の筆を地図用に取得。geom があれば lng/lat を展開して行配列で返す。
-- 点フィーチャ生成はクライアントで行う（P1 は点のみ。筆界ポリゴンは P2 で ST_AsGeoJSON 追加）。
CREATE OR REPLACE FUNCTION public.get_case_parcels_for_map(p_case_id INTEGER)
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
                'parcel_id',  p.id,
                'sort_order', p.sort_order,
                'pref',       p.pref,
                'city',       p.city,
                'oaza',       p.oaza,
                'aza',        p.aza,
                'chiban',     p.chiban,
                'chimoku',    p.chimoku,
                'area',       p.area,
                'geo_status', p.geo_status,
                'lng',        CASE WHEN p.geom IS NOT NULL THEN ST_X(p.geom) END,
                'lat',        CASE WHEN p.geom IS NOT NULL THEN ST_Y(p.geom) END
            )
            ORDER BY p.sort_order, p.id
        ),
        '[]'::JSONB
    )
    INTO v_result
    FROM public.case_parcels p
    WHERE p.case_id = p_case_id;

    RETURN v_result;
END;
$$;

-- 筆に代表点（手動ピン）を設定。geom を WGS84(4326) で保存。
-- geo_status は筆界があれば 'boundary' を尊重、無ければ 'pinned'。戻り値=再検証/監査用 case_id。
CREATE OR REPLACE FUNCTION public.set_case_parcel_pin(
    p_parcel_id INTEGER,
    p_lng DOUBLE PRECISION,
    p_lat DOUBLE PRECISION
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_case_id INTEGER;
BEGIN
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;

    IF p_lng IS NULL OR p_lat IS NULL
       OR p_lng < -180 OR p_lng > 180 OR p_lat < -90 OR p_lat > 90 THEN
        RAISE EXCEPTION 'invalid coordinates' USING ERRCODE = '22023';
    END IF;

    UPDATE public.case_parcels
       SET geom = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326),
           geo_status = CASE WHEN boundary IS NOT NULL THEN 'boundary' ELSE 'pinned' END
     WHERE id = p_parcel_id
     RETURNING case_id INTO v_case_id;

    IF v_case_id IS NULL THEN
        RAISE EXCEPTION 'parcel not found' USING ERRCODE = 'P0002';
    END IF;

    RETURN v_case_id;
END;
$$;

-- 筆の代表点を解除。筆界があれば 'boundary' を維持、無ければ 'unset'。戻り値=case_id。
CREATE OR REPLACE FUNCTION public.clear_case_parcel_geo(p_parcel_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_case_id INTEGER;
BEGIN
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;

    UPDATE public.case_parcels
       SET geom = NULL,
           geo_status = CASE WHEN boundary IS NOT NULL THEN 'boundary' ELSE 'unset' END
     WHERE id = p_parcel_id
     RETURNING case_id INTO v_case_id;

    IF v_case_id IS NULL THEN
        RAISE EXCEPTION 'parcel not found' USING ERRCODE = 'P0002';
    END IF;

    RETURN v_case_id;
END;
$$;
