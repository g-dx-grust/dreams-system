-- see: docs/phase4/10_dashboard.md §データ取得（Supabase RPC）

CREATE OR REPLACE FUNCTION public.dashboard_summary()
RETURNS JSONB AS $$
    SELECT jsonb_build_object(
        'total_cases',  (SELECT COUNT(*) FROM cases WHERE status <> 'cancelled'),
        'in_progress',  (SELECT COUNT(*) FROM cases WHERE status = 'in_progress'),
        'overdue',      (SELECT COUNT(*) FROM cases
                         WHERE deadline_date < CURRENT_DATE
                           AND status NOT IN ('completed','cancelled')),
        'due_soon',     (SELECT COUNT(*) FROM cases
                         WHERE deadline_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
                           AND status NOT IN ('completed','cancelled')),
        'unpaid_count', (SELECT COUNT(*) FROM case_financials
                         WHERE invoice_amount IS NOT NULL AND paid_amount IS NULL),
        'unpaid_total', COALESCE((SELECT SUM(invoice_amount) FROM case_financials
                                  WHERE invoice_amount IS NOT NULL AND paid_amount IS NULL), 0)
    );
$$ LANGUAGE sql STABLE SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.dashboard_overdue_cases(p_limit INT DEFAULT 20)
RETURNS TABLE (
    id             INT,
    case_number    TEXT,
    case_name      TEXT,
    assigned_user  TEXT,
    deadline_date  DATE,
    status         TEXT,
    days_remaining INT
) AS $$
    SELECT
        c.id,
        c.case_number,
        c.case_name,
        u.full_name,
        c.deadline_date,
        c.status,
        (c.deadline_date - CURRENT_DATE)::INT
    FROM cases c
    LEFT JOIN users u ON u.id = c.assigned_user_id
    WHERE (
        c.deadline_date < CURRENT_DATE
        OR c.deadline_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
    )
      AND c.status NOT IN ('completed','cancelled')
    ORDER BY c.deadline_date ASC
    LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.dashboard_unpaid_cases(p_limit INT DEFAULT 20)
RETURNS TABLE (
    case_id        INT,
    case_number    TEXT,
    case_name      TEXT,
    invoice_amount BIGINT,
    tax_rate       NUMERIC,
    updated_at     TIMESTAMPTZ
) AS $$
    SELECT
        c.id,
        c.case_number,
        c.case_name,
        f.invoice_amount,
        f.tax_rate,
        f.updated_at
    FROM case_financials f
    JOIN cases c ON c.id = f.case_id
    WHERE f.invoice_amount IS NOT NULL AND f.paid_amount IS NULL
    ORDER BY f.updated_at ASC
    LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.dashboard_monthly_stats()
RETURNS TABLE (
    year_month      TEXT,
    new_cases       INT,
    completed_cases INT,
    invoice_amount  BIGINT,
    paid_amount     BIGINT
) AS $$
    WITH months AS (
        SELECT to_char(
            generate_series(
                date_trunc('month', CURRENT_DATE) - INTERVAL '11 months',
                date_trunc('month', CURRENT_DATE),
                INTERVAL '1 month'
            ), 'YYYY-MM'
        ) AS ym
    )
    SELECT
        m.ym,
        COALESCE(nc.cnt, 0)::INT,
        COALESCE(cc.cnt, 0)::INT,
        COALESCE(inv.sum_amt, 0)::BIGINT,
        COALESCE(pd.sum_amt, 0)::BIGINT
    FROM months m
    LEFT JOIN (
        SELECT to_char(created_at, 'YYYY-MM') AS ym, COUNT(*) cnt
        FROM cases GROUP BY 1
    ) nc ON nc.ym = m.ym
    LEFT JOIN (
        SELECT to_char(updated_at, 'YYYY-MM') AS ym, COUNT(*) cnt
        FROM cases WHERE status = 'completed' GROUP BY 1
    ) cc ON cc.ym = m.ym
    LEFT JOIN (
        SELECT to_char(updated_at, 'YYYY-MM') AS ym, SUM(invoice_amount) sum_amt
        FROM case_financials WHERE invoice_amount IS NOT NULL GROUP BY 1
    ) inv ON inv.ym = m.ym
    LEFT JOIN (
        SELECT to_char(paid_date, 'YYYY-MM') AS ym, SUM(paid_amount) sum_amt
        FROM case_financials WHERE paid_amount IS NOT NULL GROUP BY 1
    ) pd ON pd.ym = m.ym
    ORDER BY m.ym;
$$ LANGUAGE sql STABLE SECURITY INVOKER;
