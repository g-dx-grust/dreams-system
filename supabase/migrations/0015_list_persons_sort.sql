-- 関係者台帳一覧にサーバ側ソートを追加する。
-- p_sort / p_order を受け取り、許可カラムのみ CASE で並べ替える（SQLインジェクション不可）。
-- 未指定時は従来どおり「更新降順」。see: DESIGN.md §8.4
-- 引数の追加に伴い旧シグネチャを DROP してから CREATE する（0010 と同じ作法）。

DROP FUNCTION IF EXISTS public.list_persons_safe(TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.list_persons_safe(
    p_q TEXT DEFAULT NULL,
    p_person_type TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_sort TEXT DEFAULT NULL,
    p_order TEXT DEFAULT NULL
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
    ),
    params AS (
        SELECT
            LOWER(COALESCE(NULLIF(BTRIM(p_sort), ''), '')) AS sort_key,
            CASE WHEN LOWER(COALESCE(p_order, 'asc')) = 'desc' THEN 'desc' ELSE 'asc' END AS sort_dir
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
    CROSS JOIN params AS p
    ORDER BY
        CASE WHEN p.sort_key = 'person_type' AND p.sort_dir = 'asc'  THEN f.person_type       END ASC  NULLS LAST,
        CASE WHEN p.sort_key = 'person_type' AND p.sort_dir = 'desc' THEN f.person_type       END DESC NULLS LAST,
        CASE WHEN p.sort_key = 'name'        AND p.sort_dir = 'asc'  THEN f.name               END ASC  NULLS LAST,
        CASE WHEN p.sort_key = 'name'        AND p.sort_dir = 'desc' THEN f.name               END DESC NULLS LAST,
        CASE WHEN p.sort_key = 'name_kana'   AND p.sort_dir = 'asc'  THEN f.name_kana          END ASC  NULLS LAST,
        CASE WHEN p.sort_key = 'name_kana'   AND p.sort_dir = 'desc' THEN f.name_kana          END DESC NULLS LAST,
        CASE WHEN p.sort_key = 'role'        AND p.sort_dir = 'asc'  THEN f.default_case_role  END ASC  NULLS LAST,
        CASE WHEN p.sort_key = 'role'        AND p.sort_dir = 'desc' THEN f.default_case_role  END DESC NULLS LAST,
        CASE WHEN p.sort_key = 'updated'     AND p.sort_dir = 'asc'  THEN f.updated_at         END ASC  NULLS LAST,
        CASE WHEN p.sort_key = 'updated'     AND p.sort_dir = 'desc' THEN f.updated_at         END DESC NULLS LAST,
        -- 既定（未指定・不正値）の並び: 更新降順
        CASE
            WHEN p.sort_key NOT IN ('person_type', 'name', 'name_kana', 'role', 'updated')
            THEN f.updated_at
        END DESC,
        f.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
