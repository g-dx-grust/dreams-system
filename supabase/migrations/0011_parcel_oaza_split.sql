-- ================================================================
-- 土地情報の「大字」「字」分割
-- - case_parcels に oaza（大字）列を追加
-- - 既存 aza 列は今後「字」を表す（過去データの混在値は保持し、UIで再分割）
-- - replace_case_parcels RPC を oaza 対応に更新
-- see: 修正メモ20260520.md（大字と字の分割機能）
-- ================================================================

ALTER TABLE public.case_parcels
    ADD COLUMN IF NOT EXISTS oaza VARCHAR(100);

COMMENT ON COLUMN public.case_parcels.oaza IS '大字。aza は字（旧データは大字・字の混在値を保持）';
COMMENT ON COLUMN public.case_parcels.aza  IS '字。oaza（大字）と対で使用';

-- ----------------------------------------------------------------
-- 一括置換 RPC を oaza 対応に更新（see: 0009_operational_safety_and_search.sql）
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_case_parcels(
    p_case_id INTEGER,
    p_rows JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    IF NOT public.is_active_user() THEN
        RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.cases WHERE id = p_case_id) THEN
        RAISE EXCEPTION 'case not found' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.case_parcels WHERE case_id = p_case_id;

    INSERT INTO public.case_parcels (
        case_id,
        sort_order,
        pref,
        city,
        oaza,
        aza,
        chiban,
        chimoku,
        area,
        tenyo_area,
        memo
    )
    SELECT
        p_case_id,
        COALESCE((row_data.value->>'sort_order')::INTEGER, row_data.ordinality::INTEGER - 1),
        NULLIF(row_data.value->>'pref', ''),
        NULLIF(row_data.value->>'city', ''),
        NULLIF(row_data.value->>'oaza', ''),
        NULLIF(row_data.value->>'aza', ''),
        NULLIF(row_data.value->>'chiban', ''),
        NULLIF(row_data.value->>'chimoku', ''),
        NULLIF(row_data.value->>'area', '')::NUMERIC,
        NULLIF(row_data.value->>'tenyo_area', '')::NUMERIC,
        NULLIF(row_data.value->>'memo', '')
    FROM jsonb_array_elements(COALESCE(p_rows, '[]'::JSONB)) WITH ORDINALITY AS row_data(value, ordinality);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;
