-- 案件一覧にサーバ側ソートを追加する。
-- p_sort / p_order を受け取り、許可カラムのみ CASE で並べ替える（SQLインジェクション不可）。
-- 未指定時は従来どおり「締切昇順 → 更新降順」。see: docs/uiux-redesign-plan.md フェーズ3 / DESIGN.md §8.4

CREATE OR REPLACE FUNCTION public.list_cases_safe(
    p_q TEXT DEFAULT NULL,
    p_case_type TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_assigned_user_id UUID DEFAULT NULL,
    p_deadline_from DATE DEFAULT NULL,
    p_deadline_to DATE DEFAULT NULL,
    p_overdue_only BOOLEAN DEFAULT FALSE,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_sort TEXT DEFAULT NULL,
    p_order TEXT DEFAULT NULL
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
    ),
    params AS (
        SELECT
            LOWER(COALESCE(NULLIF(BTRIM(p_sort), ''), '')) AS sort_key,
            CASE WHEN LOWER(COALESCE(p_order, 'asc')) = 'desc' THEN 'desc' ELSE 'asc' END AS sort_dir
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
    CROSS JOIN params AS p
    ORDER BY
        CASE WHEN p.sort_key = 'case_number' AND p.sort_dir = 'asc'  THEN f.case_number END ASC  NULLS LAST,
        CASE WHEN p.sort_key = 'case_number' AND p.sort_dir = 'desc' THEN f.case_number END DESC NULLS LAST,
        CASE WHEN p.sort_key = 'case_name'   AND p.sort_dir = 'asc'  THEN f.case_name   END ASC  NULLS LAST,
        CASE WHEN p.sort_key = 'case_name'   AND p.sort_dir = 'desc' THEN f.case_name   END DESC NULLS LAST,
        CASE WHEN p.sort_key = 'case_type'   AND p.sort_dir = 'asc'  THEN f.case_type   END ASC  NULLS LAST,
        CASE WHEN p.sort_key = 'case_type'   AND p.sort_dir = 'desc' THEN f.case_type   END DESC NULLS LAST,
        CASE WHEN p.sort_key = 'status'      AND p.sort_dir = 'asc'  THEN f.status      END ASC  NULLS LAST,
        CASE WHEN p.sort_key = 'status'      AND p.sort_dir = 'desc' THEN f.status      END DESC NULLS LAST,
        CASE WHEN p.sort_key = 'deadline'    AND p.sort_dir = 'asc'  THEN f.deadline_date END ASC  NULLS LAST,
        CASE WHEN p.sort_key = 'deadline'    AND p.sort_dir = 'desc' THEN f.deadline_date END DESC NULLS LAST,
        CASE WHEN p.sort_key = 'updated'     AND p.sort_dir = 'asc'  THEN f.updated_at  END ASC  NULLS LAST,
        CASE WHEN p.sort_key = 'updated'     AND p.sort_dir = 'desc' THEN f.updated_at  END DESC NULLS LAST,
        -- 既定（未指定・不正値）の並び: 締切昇順 → 更新降順
        CASE
            WHEN p.sort_key NOT IN ('case_number', 'case_name', 'case_type', 'status', 'deadline', 'updated')
            THEN f.deadline_date
        END ASC NULLS LAST,
        f.updated_at DESC,
        f.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
