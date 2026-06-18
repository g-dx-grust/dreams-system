-- ================================================================
-- 売上ダッシュボード: 担当者別・日別売上（入金日ベース）
-- - 管理者のみ閲覧可（SECURITY DEFINER + is_admin チェック）
-- - 入金日(paid_date)を売上計上日とし、担当者×日付で集計
-- see: 修正メモ20260520.md（売上データダッシュボード／従業員の可視化）
-- ================================================================

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
        COALESCE(NULLIF(BTRIM(p_month), ''), to_char(CURRENT_DATE, 'YYYY-MM')) || '-01',
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
