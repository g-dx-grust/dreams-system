-- ================================================================
-- 運用安全性と検索安定化
-- - 案件番号採番を同時実行に強いカウンタ方式へ変更
-- - 帳票履歴のバージョン重複を禁止
-- - 一括置換処理を DB トランザクション内の RPC に集約
-- - PostgREST の or 文字列に依存しない検索 RPC を追加
-- ================================================================

-- ----------------------------------------------------------------
-- 案件番号カウンタ
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.case_number_counters (
    year          INTEGER NOT NULL,
    case_type     VARCHAR(50) NOT NULL,
    last_sequence INTEGER NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (year, case_type),
    CHECK (last_sequence >= 0)
);

ALTER TABLE public.case_number_counters ENABLE ROW LEVEL SECURITY;

INSERT INTO public.case_number_counters (year, case_type, last_sequence)
SELECT
    substring(case_number from '^(\d{4})')::INTEGER AS year,
    case_type,
    MAX((regexp_match(case_number, '^\d{4}-[A-Z]{2}-(\d+)$'))[1]::INTEGER) AS last_sequence
FROM public.cases
WHERE case_number ~ '^\d{4}-[A-Z]{2}-\d+$'
GROUP BY 1, 2
ON CONFLICT (year, case_type) DO UPDATE SET
    last_sequence = GREATEST(
        public.case_number_counters.last_sequence,
        EXCLUDED.last_sequence
    ),
    updated_at = NOW();

CREATE OR REPLACE FUNCTION public.create_case_with_number(
    p_case_name TEXT,
    p_case_type TEXT,
    p_assigned_user_id UUID DEFAULT NULL,
    p_submission_target TEXT DEFAULT NULL,
    p_submission_date DATE DEFAULT NULL,
    p_deadline_date DATE DEFAULT NULL,
    p_memo TEXT DEFAULT NULL
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
        p_memo
    )
    RETURNING public.cases.id INTO v_case_id;

    RETURN QUERY SELECT v_case_id, v_case_number;
END;
$$;

-- ----------------------------------------------------------------
-- 帳票履歴バージョンの重複防止
-- ----------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_histories_case_template_version_unique
    ON public.document_histories (case_id, template_id, version);

-- ----------------------------------------------------------------
-- 一括置換 RPC
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

CREATE OR REPLACE FUNCTION public.replace_template_mappings(
    p_template_id INTEGER,
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
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.templates WHERE id = p_template_id) THEN
        RAISE EXCEPTION 'template not found' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.template_mappings WHERE template_id = p_template_id;

    INSERT INTO public.template_mappings (
        template_id,
        placeholder,
        field_path,
        label,
        is_required,
        sort_order
    )
    SELECT
        p_template_id,
        row_data.value->>'placeholder',
        row_data.value->>'field_path',
        NULLIF(row_data.value->>'label', ''),
        COALESCE((row_data.value->>'is_required')::BOOLEAN, FALSE),
        COALESCE((row_data.value->>'sort_order')::INTEGER, row_data.ordinality::INTEGER - 1)
    FROM jsonb_array_elements(COALESCE(p_rows, '[]'::JSONB)) WITH ORDINALITY AS row_data(value, ordinality);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------
-- 検索 RPC と検索用 index
-- ----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_persons_name_trgm
    ON public.persons USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_persons_name_kana_trgm
    ON public.persons USING gin (name_kana gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_persons_address_city_trgm
    ON public.persons USING gin (address_city gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_persons_address_town_trgm
    ON public.persons USING gin (address_town gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cases_case_number_trgm
    ON public.cases USING gin (case_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cases_case_name_trgm
    ON public.cases USING gin (case_name gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.list_persons_safe(
    p_q TEXT DEFAULT NULL,
    p_person_type TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id INTEGER,
    person_type VARCHAR(20),
    name VARCHAR(200),
    name_kana VARCHAR(200),
    zip VARCHAR(10),
    address_pref VARCHAR(20),
    address_city VARCHAR(50),
    address_town VARCHAR(100),
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(200),
    phone VARCHAR(30),
    fax VARCHAR(30),
    email VARCHAR(320),
    corporate_number VARCHAR(20),
    representative_name VARCHAR(200),
    memo TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH filtered AS (
        SELECT p.*
        FROM public.persons AS p
        WHERE public.is_active_user()
          AND (p_person_type IS NULL OR p.person_type = p_person_type)
          AND (
              NULLIF(BTRIM(COALESCE(p_q, '')), '') IS NULL
              OR p.name ILIKE '%' || p_q || '%'
              OR p.name_kana ILIKE '%' || p_q || '%'
              OR p.address_city ILIKE '%' || p_q || '%'
              OR p.address_town ILIKE '%' || p_q || '%'
          )
    ),
    counted AS (
        SELECT COUNT(*) AS total FROM filtered
    )
    SELECT
        f.id,
        f.person_type,
        f.name,
        f.name_kana,
        f.zip,
        f.address_pref,
        f.address_city,
        f.address_town,
        f.address_line1,
        f.address_line2,
        f.phone,
        f.fax,
        f.email,
        f.corporate_number,
        f.representative_name,
        f.memo,
        f.created_at,
        f.updated_at,
        counted.total
    FROM filtered AS f
    CROSS JOIN counted
    ORDER BY f.updated_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.list_cases_safe(
    p_q TEXT DEFAULT NULL,
    p_case_type TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_assigned_user_id UUID DEFAULT NULL,
    p_deadline_from DATE DEFAULT NULL,
    p_deadline_to DATE DEFAULT NULL,
    p_overdue_only BOOLEAN DEFAULT FALSE,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id INTEGER,
    case_number VARCHAR(50),
    case_name VARCHAR(300),
    case_type VARCHAR(50),
    status VARCHAR(30),
    assigned_user_id UUID,
    submission_target VARCHAR(200),
    submission_date DATE,
    deadline_date DATE,
    memo TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH filtered AS (
        SELECT c.*
        FROM public.cases AS c
        WHERE public.is_active_user()
          AND (p_case_type IS NULL OR c.case_type = p_case_type)
          AND (p_status IS NULL OR c.status = p_status)
          AND (p_assigned_user_id IS NULL OR c.assigned_user_id = p_assigned_user_id)
          AND (p_deadline_from IS NULL OR c.deadline_date >= p_deadline_from)
          AND (p_deadline_to IS NULL OR c.deadline_date <= p_deadline_to)
          AND (
              NOT COALESCE(p_overdue_only, FALSE)
              OR (
                  c.deadline_date < CURRENT_DATE
                  AND c.status NOT IN ('completed', 'cancelled')
              )
          )
          AND (
              NULLIF(BTRIM(COALESCE(p_q, '')), '') IS NULL
              OR c.case_number ILIKE '%' || p_q || '%'
              OR c.case_name ILIKE '%' || p_q || '%'
          )
    ),
    counted AS (
        SELECT COUNT(*) AS total FROM filtered
    )
    SELECT
        f.id,
        f.case_number,
        f.case_name,
        f.case_type,
        f.status,
        f.assigned_user_id,
        f.submission_target,
        f.submission_date,
        f.deadline_date,
        f.memo,
        f.created_at,
        f.updated_at,
        counted.total
    FROM filtered AS f
    CROSS JOIN counted
    ORDER BY f.deadline_date ASC NULLS LAST, f.updated_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
