-- ================================================================
-- カレンダー Phase 1
-- - サイボウズ風の日表示カレンダー
-- - 日報、コメント、Lark同期の基盤
-- see: docs/calendar-phase1.md
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS entity_id_uuid UUID;

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_uuid
    ON public.audit_logs (entity_type, entity_id_uuid);

-- ================================================================
-- 予定種別
-- ================================================================

CREATE TABLE IF NOT EXISTS public.schedule_types (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(50) NOT NULL,
    color       VARCHAR(30) NOT NULL
                CHECK (color IN (
                    'danger', 'main', 'text-grey', 'chart-1', 'chart-2',
                    'chart-3', 'chart-4', 'chart-5', 'chart-6', 'chart-7',
                    'chart-8', 'chart-9', 'chart-10', 'neutral'
                )),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.schedule_types
    ADD COLUMN IF NOT EXISTS color VARCHAR(30) NOT NULL DEFAULT 'neutral',
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_types_name_unique
    ON public.schedule_types (name);

CREATE INDEX IF NOT EXISTS idx_schedule_types_active_sort
    ON public.schedule_types (is_active, sort_order, name);

-- ================================================================
-- 予定
-- ================================================================

CREATE TABLE IF NOT EXISTS public.schedules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title             VARCHAR(200) NOT NULL,
    start_at          TIMESTAMPTZ NOT NULL,
    end_at            TIMESTAMPTZ NOT NULL,
    user_id           UUID REFERENCES public.users(id),
    co_user_ids       UUID[] NOT NULL DEFAULT '{}',
    case_id           INTEGER REFERENCES public.cases(id) ON DELETE SET NULL,
    case_number       VARCHAR(50),
    schedule_type_id  UUID REFERENCES public.schedule_types(id),
    location          VARCHAR(200),
    memo              TEXT,
    status            VARCHAR(30) NOT NULL DEFAULT 'planned'
                      CHECK (status IN (
                          'planned', 'in_progress', 'done',
                          'carried_over', 'cancelled'
                      )),
    actual_start_at   TIMESTAMPTZ,
    actual_end_at     TIMESTAMPTZ,
    actual_minutes    INTEGER CHECK (actual_minutes IS NULL OR actual_minutes >= 0),
    lark_calendar_id  VARCHAR(100),
    lark_event_id     VARCHAR(100),
    lark_event_etag   VARCHAR(200),
    sync_source       VARCHAR(20) NOT NULL DEFAULT 'app'
                      CHECK (sync_source IN ('app', 'lark')),
    sync_status       VARCHAR(30) NOT NULL DEFAULT 'pending'
                      CHECK (sync_status IN ('pending', 'synced', 'failed', 'ignored')),
    sync_error        TEXT,
    last_synced_at    TIMESTAMPTZ,
    created_by        UUID REFERENCES public.users(id),
    updated_by        UUID REFERENCES public.users(id),
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID REFERENCES public.users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_at > start_at),
    CHECK (actual_end_at IS NULL OR actual_start_at IS NULL OR actual_end_at >= actual_start_at)
);

ALTER TABLE public.schedules
    ADD COLUMN IF NOT EXISTS title VARCHAR(200),
    ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS co_user_ids UUID[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS case_id INTEGER REFERENCES public.cases(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS case_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS schedule_type_id UUID REFERENCES public.schedule_types(id),
    ADD COLUMN IF NOT EXISTS location VARCHAR(200),
    ADD COLUMN IF NOT EXISTS memo TEXT,
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'planned',
    ADD COLUMN IF NOT EXISTS actual_start_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS actual_end_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS actual_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS lark_calendar_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS lark_event_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS lark_event_etag VARCHAR(200),
    ADD COLUMN IF NOT EXISTS sync_source VARCHAR(20) NOT NULL DEFAULT 'app',
    ADD COLUMN IF NOT EXISTS sync_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS sync_error TEXT,
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_schedules_time_range
    ON public.schedules (start_at, end_at)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_schedules_user_time
    ON public.schedules (user_id, start_at, end_at)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_schedules_case_id
    ON public.schedules (case_id)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_schedules_sync_pending
    ON public.schedules (sync_status, updated_at)
    WHERE sync_status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_lark_event_unique
    ON public.schedules (lark_calendar_id, lark_event_id)
    WHERE lark_event_id IS NOT NULL AND deleted_at IS NULL;

-- ================================================================
-- 日報
-- ================================================================

CREATE TABLE IF NOT EXISTS public.daily_reports (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES public.users(id),
    report_date      DATE NOT NULL,
    body             TEXT NOT NULL DEFAULT '',
    content          TEXT,
    status           VARCHAR(20) NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'submitted')),
    submitted_at     TIMESTAMPTZ,
    lark_notified_at TIMESTAMPTZ,
    created_by       UUID REFERENCES public.users(id),
    updated_by       UUID REFERENCES public.users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, report_date)
);

ALTER TABLE public.daily_reports
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS report_date DATE,
    ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS content TEXT,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS lark_notified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.daily_reports
    ALTER COLUMN submitted_at DROP NOT NULL,
    ALTER COLUMN submitted_at DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_daily_reports_date_user
    ON public.daily_reports (report_date, user_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_status
    ON public.daily_reports (status, submitted_at);

-- ================================================================
-- コメント
-- ================================================================

CREATE TABLE IF NOT EXISTS public.comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type VARCHAR(20) NOT NULL
                CHECK (target_type IN ('schedule', 'daily_report')),
    target_id   UUID NOT NULL,
    user_id     UUID NOT NULL REFERENCES public.users(id),
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.comments
    ADD COLUMN IF NOT EXISTS target_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS target_id UUID,
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id),
    ADD COLUMN IF NOT EXISTS body TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_comments_target
    ON public.comments (target_type, target_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_user
    ON public.comments (user_id, created_at);

DROP TRIGGER IF EXISTS trg_schedule_types_updated_at ON public.schedule_types;
CREATE TRIGGER trg_schedule_types_updated_at
    BEFORE UPDATE ON public.schedule_types
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_schedules_updated_at ON public.schedules;
CREATE TRIGGER trg_schedules_updated_at
    BEFORE UPDATE ON public.schedules
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_daily_reports_updated_at ON public.daily_reports;
CREATE TRIGGER trg_daily_reports_updated_at
    BEFORE UPDATE ON public.daily_reports
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_comments_updated_at ON public.comments;
CREATE TRIGGER trg_comments_updated_at
    BEFORE UPDATE ON public.comments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================================================================
-- 初期データ
-- ================================================================

INSERT INTO public.schedule_types (name, color, sort_order) VALUES
    ('重要',   'danger',    1),
    ('現場',   'chart-1',   2),
    ('社内',   'text-grey', 3),
    ('社外',   'chart-2',   4),
    ('役所',   'chart-6',   5),
    ('測量',   'chart-4',   6),
    ('登記',   'chart-8',   7),
    ('申請',   'chart-5',   8),
    ('来客',   'main',      9),
    ('移動',   'neutral',  10),
    ('休み',   'chart-10', 11),
    ('その他', 'neutral',  12)
ON CONFLICT (name) DO UPDATE SET
    color = EXCLUDED.color,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

-- ================================================================
-- Row Level Security
-- ================================================================

ALTER TABLE public.schedule_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedule_types_select ON public.schedule_types;
CREATE POLICY schedule_types_select ON public.schedule_types
    FOR SELECT USING (public.is_active_user());
DROP POLICY IF EXISTS schedule_types_admin_write ON public.schedule_types;
CREATE POLICY schedule_types_admin_write ON public.schedule_types
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedules_select ON public.schedules;
CREATE POLICY schedules_select ON public.schedules
    FOR SELECT USING (public.is_active_user() AND deleted_at IS NULL);
DROP POLICY IF EXISTS schedules_insert ON public.schedules;
CREATE POLICY schedules_insert ON public.schedules
    FOR INSERT WITH CHECK (
        public.is_active_user()
        AND deleted_at IS NULL
        AND (public.is_admin() OR user_id = auth.uid() OR created_by = auth.uid())
    );
DROP POLICY IF EXISTS schedules_update ON public.schedules;
CREATE POLICY schedules_update ON public.schedules
    FOR UPDATE USING (
        public.is_active_user()
        AND deleted_at IS NULL
        AND (public.is_admin() OR user_id = auth.uid() OR created_by = auth.uid())
    )
    WITH CHECK (
        public.is_active_user()
        AND (public.is_admin() OR user_id = auth.uid() OR created_by = auth.uid())
    );
DROP POLICY IF EXISTS schedules_delete_admin ON public.schedules;
CREATE POLICY schedules_delete_admin ON public.schedules
    FOR DELETE USING (public.is_admin());

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_reports_select ON public.daily_reports;
CREATE POLICY daily_reports_select ON public.daily_reports
    FOR SELECT USING (public.is_admin() OR user_id = auth.uid());
DROP POLICY IF EXISTS daily_reports_insert ON public.daily_reports;
CREATE POLICY daily_reports_insert ON public.daily_reports
    FOR INSERT WITH CHECK (public.is_admin() OR user_id = auth.uid());
DROP POLICY IF EXISTS daily_reports_update ON public.daily_reports;
CREATE POLICY daily_reports_update ON public.daily_reports
    FOR UPDATE USING (public.is_admin() OR user_id = auth.uid())
    WITH CHECK (public.is_admin() OR user_id = auth.uid());
DROP POLICY IF EXISTS daily_reports_delete_admin ON public.daily_reports;
CREATE POLICY daily_reports_delete_admin ON public.daily_reports
    FOR DELETE USING (public.is_admin());

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS comments_select ON public.comments;
CREATE POLICY comments_select ON public.comments
    FOR SELECT USING (
        public.is_active_user()
        AND (
            (
                target_type = 'schedule'
                AND EXISTS (
                    SELECT 1 FROM public.schedules s
                    WHERE s.id = target_id AND s.deleted_at IS NULL
                )
            )
            OR (
                target_type = 'daily_report'
                AND EXISTS (
                    SELECT 1 FROM public.daily_reports r
                    WHERE r.id = target_id AND (public.is_admin() OR r.user_id = auth.uid())
                )
            )
        )
    );
DROP POLICY IF EXISTS comments_insert ON public.comments;
CREATE POLICY comments_insert ON public.comments
    FOR INSERT WITH CHECK (
        public.is_active_user()
        AND user_id = auth.uid()
        AND (
            (
                target_type = 'schedule'
                AND EXISTS (
                    SELECT 1 FROM public.schedules s
                    WHERE s.id = target_id AND s.deleted_at IS NULL
                )
            )
            OR (
                target_type = 'daily_report'
                AND EXISTS (
                    SELECT 1 FROM public.daily_reports r
                    WHERE r.id = target_id AND (public.is_admin() OR r.user_id = auth.uid())
                )
            )
        )
    );
DROP POLICY IF EXISTS comments_update_own ON public.comments;
CREATE POLICY comments_update_own ON public.comments
    FOR UPDATE USING (public.is_admin() OR user_id = auth.uid())
    WITH CHECK (public.is_admin() OR user_id = auth.uid());
DROP POLICY IF EXISTS comments_delete_own ON public.comments;
CREATE POLICY comments_delete_own ON public.comments
    FOR DELETE USING (public.is_admin() OR user_id = auth.uid());
