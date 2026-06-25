-- DB 関数で扱う「今日」「今月」「採番年」を日本時間に固定する。

CREATE OR REPLACE FUNCTION public.app_today_jst()
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_summary()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    WITH today AS (
        SELECT public.app_today_jst() AS value
    )
    SELECT jsonb_build_object(
        'total_cases',  (SELECT COUNT(*) FROM cases WHERE status <> 'cancelled'),
        'in_progress',  (SELECT COUNT(*) FROM cases WHERE status = 'in_progress'),
        'overdue',      (SELECT COUNT(*) FROM cases
                         WHERE deadline_date < today.value
                           AND status NOT IN ('completed','cancelled')),
        'due_soon',     (SELECT COUNT(*) FROM cases
                         WHERE deadline_date BETWEEN today.value AND today.value + 7
                           AND status NOT IN ('completed','cancelled')),
        'unpaid_count', (SELECT COUNT(*) FROM case_financials
                         WHERE invoice_amount IS NOT NULL AND paid_amount IS NULL),
        'unpaid_total', COALESCE((SELECT SUM(invoice_amount) FROM case_financials
                                  WHERE invoice_amount IS NOT NULL AND paid_amount IS NULL), 0)
    )
    FROM today;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_overdue_cases(p_limit INT DEFAULT 20)
RETURNS TABLE (
    id             INT,
    case_number    TEXT,
    case_name      TEXT,
    assigned_user  TEXT,
    deadline_date  DATE,
    status         TEXT,
    days_remaining INT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    WITH today AS (
        SELECT public.app_today_jst() AS value
    )
    SELECT
        c.id,
        c.case_number,
        c.case_name,
        u.full_name,
        c.deadline_date,
        c.status,
        (c.deadline_date - today.value)::INT
    FROM cases c
    CROSS JOIN today
    LEFT JOIN users u ON u.id = c.assigned_user_id
    WHERE (
        c.deadline_date < today.value
        OR c.deadline_date BETWEEN today.value AND today.value + 7
    )
      AND c.status NOT IN ('completed','cancelled')
    ORDER BY c.deadline_date ASC
    LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_monthly_stats()
RETURNS TABLE (
    year_month      TEXT,
    new_cases       INT,
    completed_cases INT,
    invoice_amount  BIGINT,
    paid_amount     BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    WITH today AS (
        SELECT public.app_today_jst() AS value
    ),
    months AS (
        SELECT to_char(
            generate_series(
                date_trunc('month', today.value::timestamp) - INTERVAL '11 months',
                date_trunc('month', today.value::timestamp),
                INTERVAL '1 month'
            ), 'YYYY-MM'
        ) AS ym
        FROM today
    )
    SELECT
        m.ym,
        COALESCE(nc.cnt, 0)::INT,
        COALESCE(cc.cnt, 0)::INT,
        COALESCE(inv.sum_amt, 0)::BIGINT,
        COALESCE(pd.sum_amt, 0)::BIGINT
    FROM months m
    LEFT JOIN (
        SELECT to_char(created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM') AS ym, COUNT(*) cnt
        FROM cases GROUP BY 1
    ) nc ON nc.ym = m.ym
    LEFT JOIN (
        SELECT to_char(updated_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM') AS ym, COUNT(*) cnt
        FROM cases WHERE status = 'completed' GROUP BY 1
    ) cc ON cc.ym = m.ym
    LEFT JOIN (
        SELECT to_char(updated_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM') AS ym, SUM(invoice_amount) sum_amt
        FROM case_financials WHERE invoice_amount IS NOT NULL GROUP BY 1
    ) inv ON inv.ym = m.ym
    LEFT JOIN (
        SELECT to_char(paid_date, 'YYYY-MM') AS ym, SUM(paid_amount) sum_amt
        FROM case_financials WHERE paid_amount IS NOT NULL GROUP BY 1
    ) pd ON pd.ym = m.ym
    ORDER BY m.ym;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_employee_daily_sales(
    p_month TEXT DEFAULT NULL
)
RETURNS TABLE (
    sale_date        DATE,
    assigned_user_id UUID,
    employee_name    TEXT,
    case_count       INTEGER,
    invoice_amount   BIGINT,
    paid_amount      BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month_start DATE;
    v_month_end   DATE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;

    v_month_start := to_date(
        COALESCE(NULLIF(BTRIM(p_month), ''), to_char(public.app_today_jst(), 'YYYY-MM')) || '-01',
        'YYYY-MM-DD'
    );
    v_month_end := v_month_start + INTERVAL '1 month';

    RETURN QUERY
    SELECT
        f.paid_date AS sale_date,
        c.assigned_user_id,
        COALESCE(u.full_name, '未割当') AS employee_name,
        COUNT(*)::INTEGER AS case_count,
        COALESCE(SUM(f.invoice_amount), 0)::BIGINT AS invoice_amount,
        COALESCE(SUM(f.paid_amount), 0)::BIGINT AS paid_amount
    FROM public.case_financials f
    JOIN public.cases c ON c.id = f.case_id
    LEFT JOIN public.users u ON u.id = c.assigned_user_id
    WHERE f.paid_date IS NOT NULL
      AND f.paid_date >= v_month_start
      AND f.paid_date <  v_month_end
    GROUP BY f.paid_date, c.assigned_user_id, u.full_name
    ORDER BY f.paid_date ASC, employee_name ASC;
END;
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
    WITH today AS (
        SELECT public.app_today_jst() AS value
    ),
    filtered AS (
        SELECT c.*
        FROM public.cases AS c
        CROSS JOIN today
        WHERE public.is_active_user()
          AND (p_case_type IS NULL OR c.case_type = p_case_type)
          AND (p_status IS NULL OR c.status = p_status)
          AND (p_assigned_user_id IS NULL OR c.assigned_user_id = p_assigned_user_id)
          AND (p_deadline_from IS NULL OR c.deadline_date >= p_deadline_from)
          AND (p_deadline_to IS NULL OR c.deadline_date <= p_deadline_to)
          AND (
              NOT COALESCE(p_overdue_only, FALSE)
              OR (
                  c.deadline_date < today.value
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
        CASE
            WHEN p.sort_key NOT IN ('case_number', 'case_name', 'case_type', 'status', 'deadline', 'updated')
            THEN f.deadline_date
        END ASC NULLS LAST,
        f.updated_at DESC,
        f.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

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
    v_year INTEGER := EXTRACT(YEAR FROM public.app_today_jst())::INTEGER;
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
    v_year INTEGER := EXTRACT(YEAR FROM public.app_today_jst())::INTEGER;
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
