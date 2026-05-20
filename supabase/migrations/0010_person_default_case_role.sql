-- ================================================================
-- 関係者台帳: 案件追加時の既定役割
-- ================================================================

ALTER TABLE public.persons
    ADD COLUMN IF NOT EXISTS default_case_role VARCHAR(30);

ALTER TABLE public.persons
    DROP CONSTRAINT IF EXISTS persons_default_case_role_check;

ALTER TABLE public.persons
    ADD CONSTRAINT persons_default_case_role_check
    CHECK (
        default_case_role IS NULL
        OR default_case_role IN (
            'applicant',
            'transferee',
            'transferor',
            'agent',
            'billing',
            'neighbor',
            'other'
        )
    );

CREATE INDEX IF NOT EXISTS idx_persons_default_case_role
    ON public.persons (default_case_role);

CREATE OR REPLACE FUNCTION public.list_persons_safe(
    p_q TEXT DEFAULT NULL,
    p_person_type TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id INTEGER,
    person_type VARCHAR(20),
    default_case_role VARCHAR(30),
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
              OR p.default_case_role ILIKE '%' || p_q || '%'
              OR CASE p.default_case_role
                    WHEN 'applicant' THEN '申請者'
                    WHEN 'transferee' THEN '譲受人'
                    WHEN 'transferor' THEN '譲渡人'
                    WHEN 'agent' THEN '代理人/行政書士'
                    WHEN 'billing' THEN '請求先'
                    WHEN 'neighbor' THEN '隣地所有者'
                    WHEN 'other' THEN 'その他'
                    ELSE ''
                 END ILIKE '%' || p_q || '%'
          )
    ),
    counted AS (
        SELECT COUNT(*) AS total FROM filtered
    )
    SELECT
        f.id,
        f.person_type,
        f.default_case_role,
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
