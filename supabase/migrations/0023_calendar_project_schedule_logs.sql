-- ================================================================
-- カレンダー Phase 2: 案件別稼働ログ
-- - 完了予定の実績工数を案件単位で集計する
-- - schedules を正本にし、予定更新時に再生成する中間ログ
-- see: docs/02_database_schema.md §4
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.project_schedule_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id           INTEGER NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    schedule_id       UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
    user_id           UUID REFERENCES public.users(id) ON DELETE SET NULL,
    work_category_id  UUID,
    work_date         DATE NOT NULL,
    minutes           INTEGER NOT NULL CHECK (minutes > 0),
    memo              TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.project_schedule_logs
    ADD COLUMN IF NOT EXISTS case_id INTEGER REFERENCES public.cases(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES public.schedules(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS work_category_id UUID,
    ADD COLUMN IF NOT EXISTS work_date DATE,
    ADD COLUMN IF NOT EXISTS minutes INTEGER,
    ADD COLUMN IF NOT EXISTS memo TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_schedule_logs_schedule_user
    ON public.project_schedule_logs (schedule_id, user_id);

CREATE INDEX IF NOT EXISTS idx_project_schedule_logs_case_date
    ON public.project_schedule_logs (case_id, work_date);

CREATE INDEX IF NOT EXISTS idx_project_schedule_logs_user_date
    ON public.project_schedule_logs (user_id, work_date);

DROP TRIGGER IF EXISTS trg_project_schedule_logs_updated_at ON public.project_schedule_logs;
CREATE TRIGGER trg_project_schedule_logs_updated_at
    BEFORE UPDATE ON public.project_schedule_logs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.project_schedule_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_schedule_logs_select ON public.project_schedule_logs;
CREATE POLICY project_schedule_logs_select ON public.project_schedule_logs
    FOR SELECT USING (
        public.is_active_user()
        AND (
            public.is_admin()
            OR user_id = auth.uid()
            OR EXISTS (
                SELECT 1
                FROM public.schedules s
                WHERE s.id = schedule_id
                  AND s.deleted_at IS NULL
                  AND (s.user_id = auth.uid() OR s.created_by = auth.uid())
            )
        )
    );

DROP POLICY IF EXISTS project_schedule_logs_admin_write ON public.project_schedule_logs;
CREATE POLICY project_schedule_logs_admin_write ON public.project_schedule_logs
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
