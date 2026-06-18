-- ================================================================
-- 案件座標 P1: cases に緯度/経度を追加し、案件ピンを正本にする
-- - 座標は世界測地系（JGD2011/WGS84 相当）の緯度/経度
-- - 任意座標運用を阻害しないため NULL 許容。両方揃ったときだけ有効な案件ピン
-- see: docs/phase2/06_cases_master.md 地図座標
-- ================================================================

ALTER TABLE public.cases
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

COMMENT ON COLUMN public.cases.latitude IS '案件ピン緯度。世界測地系（JGD2011/WGS84 相当）。NULL は未設定';
COMMENT ON COLUMN public.cases.longitude IS '案件ピン経度。世界測地系（JGD2011/WGS84 相当）。NULL は未設定';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'cases_latitude_range'
          AND conrelid = 'public.cases'::regclass
    ) THEN
        ALTER TABLE public.cases
            ADD CONSTRAINT cases_latitude_range
            CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'cases_longitude_range'
          AND conrelid = 'public.cases'::regclass
    ) THEN
        ALTER TABLE public.cases
            ADD CONSTRAINT cases_longitude_range
            CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'cases_coordinates_pair'
          AND conrelid = 'public.cases'::regclass
    ) THEN
        ALTER TABLE public.cases
            ADD CONSTRAINT cases_coordinates_pair
            CHECK (
                (latitude IS NULL AND longitude IS NULL)
                OR (latitude IS NOT NULL AND longitude IS NOT NULL)
            );
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_cases_coordinates
    ON public.cases (latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- 既存 RPC は落とさず、座標付きのオーバーロードを追加する。
-- 既存クライアントの7引数呼び出しは従来関数、新しい画面の9引数呼び出しは本関数が受ける。
CREATE OR REPLACE FUNCTION public.create_case_with_number(
    p_case_name TEXT,
    p_case_type TEXT,
    p_assigned_user_id UUID,
    p_submission_target TEXT,
    p_submission_date DATE,
    p_deadline_date DATE,
    p_memo TEXT,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION
)
RETURNS TABLE (id INTEGER, case_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
    v_code TEXT;
    v_sequence INTEGER;
    v_case_number TEXT;
    v_case_id INTEGER;
BEGIN
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;

    IF (p_latitude IS NULL) <> (p_longitude IS NULL)
       OR p_latitude < -90 OR p_latitude > 90
       OR p_longitude < -180 OR p_longitude > 180 THEN
        RAISE EXCEPTION 'invalid coordinates' USING ERRCODE = '22023';
    END IF;

    v_code := CASE p_case_type
        WHEN 'land_improvement'    THEN 'LI'
        WHEN 'boundary_survey'     THEN 'BS'
        WHEN 'building_permit'     THEN 'BP'
        WHEN 'farmland_conversion' THEN 'FC'
        WHEN 'other'               THEN 'OT'
        ELSE NULL
    END;

    IF v_code IS NULL THEN
        RAISE EXCEPTION 'invalid case_type' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.case_number_counters (year, case_type, last_sequence)
    VALUES (v_year, p_case_type, 1)
    ON CONFLICT (year, case_type) DO UPDATE SET
        last_sequence = public.case_number_counters.last_sequence + 1,
        updated_at = NOW()
    RETURNING last_sequence INTO v_sequence;

    v_case_number := v_year::TEXT || '-' || v_code || '-' || LPAD(v_sequence::TEXT, 3, '0');

    INSERT INTO public.cases (
        case_number,
        case_name,
        case_type,
        status,
        assigned_user_id,
        submission_target,
        submission_date,
        deadline_date,
        latitude,
        longitude,
        memo
    )
    VALUES (
        v_case_number,
        p_case_name,
        p_case_type,
        'inquiry',
        p_assigned_user_id,
        p_submission_target,
        p_submission_date,
        p_deadline_date,
        p_latitude,
        p_longitude,
        p_memo
    )
    RETURNING public.cases.id INTO v_case_id;

    RETURN QUERY SELECT v_case_id, v_case_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_case_map(p_case_id INTEGER)
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

    SELECT jsonb_build_object(
        'case',
        jsonb_build_object(
            'id', c.id,
            'case_number', c.case_number,
            'case_name', c.case_name,
            'latitude', c.latitude,
            'longitude', c.longitude
        ),
        'parcels',
        COALESCE(
            (
                SELECT jsonb_agg(
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
                )
                FROM public.case_parcels p
                WHERE p.case_id = c.id
            ),
            '[]'::JSONB
        )
    )
    INTO v_result
    FROM public.cases c
    WHERE c.id = p_case_id;

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'case not found' USING ERRCODE = 'P0002';
    END IF;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_case_coordinates(
    p_case_id INTEGER,
    p_lng DOUBLE PRECISION,
    p_lat DOUBLE PRECISION
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    UPDATE public.cases
       SET longitude = p_lng,
           latitude = p_lat
     WHERE id = p_case_id
     RETURNING id INTO v_case_id;

    IF v_case_id IS NULL THEN
        RAISE EXCEPTION 'case not found' USING ERRCODE = 'P0002';
    END IF;

    RETURN v_case_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_case_coordinates(p_case_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_case_id INTEGER;
BEGIN
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;

    UPDATE public.cases
       SET longitude = NULL,
           latitude = NULL
     WHERE id = p_case_id
     RETURNING id INTO v_case_id;

    IF v_case_id IS NULL THEN
        RAISE EXCEPTION 'case not found' USING ERRCODE = 'P0002';
    END IF;

    RETURN v_case_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_cases_for_map()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
                'case_id',         c.id,
                'case_number',     c.case_number,
                'case_name',       c.case_name,
                'case_type',       c.case_type,
                'status',          c.status,
                'lng',             c.longitude,
                'lat',             c.latitude,
                'primary_address', ps.primary_address,
                'parcel_count',    COALESCE(ps.parcel_count, 0)
            )
            ORDER BY c.updated_at DESC, c.id DESC
        ),
        '[]'::JSONB
    )
    INTO v_result
    FROM public.cases c
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*)::INTEGER AS parcel_count,
            (ARRAY_AGG(
                NULLIF(BTRIM(CONCAT_WS('', p.pref, p.city, p.oaza, p.aza, p.chiban)), '')
                ORDER BY p.sort_order, p.id
            ))[1] AS primary_address
        FROM public.case_parcels p
        WHERE p.case_id = c.id
    ) ps ON TRUE
    WHERE c.latitude IS NOT NULL
      AND c.longitude IS NOT NULL;

    RETURN v_result;
END;
$$;
