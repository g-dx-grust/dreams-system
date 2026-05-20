-- ================================================================
-- 案件管理・帳票転記システム 初期スキーマ
-- see: docs/phase1/02_db_schema.md
-- ================================================================

-- ---- Extensions ----
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ================================================================
-- ユーザー / 権限
-- ================================================================

CREATE TABLE public.users (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT NOT NULL UNIQUE,
    full_name       TEXT,
    role            TEXT NOT NULL DEFAULT 'user'
                    CHECK (role IN ('admin', 'user')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_signed_in  TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================================
-- ロール判定ヘルパ
-- ================================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
    SELECT role FROM public.users WHERE id = auth.uid() AND is_active = TRUE;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT public.current_user_role() = 'admin';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND is_active = TRUE
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ================================================================
-- 人マスタ
-- ================================================================

CREATE TABLE public.persons (
    id                  SERIAL PRIMARY KEY,
    person_type         VARCHAR(20) NOT NULL DEFAULT 'individual'
                        CHECK (person_type IN ('individual', 'corporation')),
    name                VARCHAR(200) NOT NULL,
    name_kana           VARCHAR(200),
    zip                 VARCHAR(10),
    address_pref        VARCHAR(20),
    address_city        VARCHAR(50),
    address_town        VARCHAR(100),
    address_line1       VARCHAR(200),
    address_line2       VARCHAR(200),
    phone               VARCHAR(30),
    fax                 VARCHAR(30),
    email               VARCHAR(320),
    corporate_number    VARCHAR(20),
    representative_name VARCHAR(200),
    name_normalized     VARCHAR(200),
    memo                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_persons_name            ON public.persons (name);
CREATE INDEX idx_persons_name_kana       ON public.persons (name_kana);
CREATE INDEX idx_persons_zip             ON public.persons (zip);
CREATE INDEX idx_persons_name_normalized ON public.persons (name_normalized);
CREATE INDEX idx_persons_name_normalized_trgm
    ON public.persons USING gin (name_normalized gin_trgm_ops);

-- ================================================================
-- 案件
-- ================================================================

CREATE TABLE public.cases (
    id                  SERIAL PRIMARY KEY,
    case_number         VARCHAR(50) NOT NULL UNIQUE,
    case_name           VARCHAR(300) NOT NULL,
    case_type           VARCHAR(50) NOT NULL
                        CHECK (case_type IN (
                            'land_improvement',
                            'boundary_survey',
                            'building_permit',
                            'farmland_conversion',
                            'other'
                        )),
    status              VARCHAR(30) NOT NULL DEFAULT 'inquiry'
                        CHECK (status IN (
                            'inquiry', 'in_progress', 'submitted',
                            'approved', 'completed', 'cancelled'
                        )),
    assigned_user_id    UUID REFERENCES public.users(id),
    submission_target   VARCHAR(200),
    submission_date     DATE,
    deadline_date       DATE,
    memo                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cases_case_number      ON public.cases (case_number);
CREATE INDEX idx_cases_case_type        ON public.cases (case_type);
CREATE INDEX idx_cases_status           ON public.cases (status);
CREATE INDEX idx_cases_deadline_date    ON public.cases (deadline_date);
CREATE INDEX idx_cases_assigned_user_id ON public.cases (assigned_user_id);

-- ---- 案件番号採番 ----
CREATE OR REPLACE FUNCTION public.next_case_number(p_case_type TEXT)
RETURNS TEXT AS $$
DECLARE
    v_year TEXT := to_char(CURRENT_DATE, 'YYYY');
    v_code TEXT;
    v_seq INTEGER;
BEGIN
    v_code := CASE p_case_type
        WHEN 'land_improvement'    THEN 'LI'
        WHEN 'boundary_survey'     THEN 'BS'
        WHEN 'building_permit'     THEN 'BP'
        WHEN 'farmland_conversion' THEN 'FC'
        ELSE 'OT'
    END;

    SELECT COALESCE(MAX(
        (regexp_match(case_number, '^\d{4}-[A-Z]{2}-(\d+)$'))[1]::int
    ), 0) + 1 INTO v_seq
    FROM public.cases
    WHERE case_number LIKE v_year || '-' || v_code || '-%';

    RETURN v_year || '-' || v_code || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- 案件関係者（スナップショット）
-- ================================================================

CREATE TABLE public.case_persons (
    id                      SERIAL PRIMARY KEY,
    case_id                 INTEGER NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    person_id               INTEGER REFERENCES public.persons(id) ON DELETE SET NULL,
    role                    VARCHAR(30) NOT NULL
                            CHECK (role IN (
                                'applicant', 'transferee', 'transferor',
                                'agent', 'billing', 'neighbor', 'other'
                            )),
    sort_order              INTEGER NOT NULL DEFAULT 0,
    snapshot_name           VARCHAR(200),
    snapshot_name_kana      VARCHAR(200),
    snapshot_zip            VARCHAR(10),
    snapshot_address_pref   VARCHAR(20),
    snapshot_address_city   VARCHAR(50),
    snapshot_address_town   VARCHAR(100),
    snapshot_address_line1  VARCHAR(200),
    snapshot_address_line2  VARCHAR(200),
    snapshot_phone          VARCHAR(30),
    snapshot_email          VARCHAR(320),
    snapshot_at             TIMESTAMPTZ,
    memo                    TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_persons_case_id   ON public.case_persons (case_id);
CREATE INDEX idx_case_persons_person_id ON public.case_persons (person_id);

-- ================================================================
-- 案件土地情報
-- ================================================================

CREATE TABLE public.case_parcels (
    id              SERIAL PRIMARY KEY,
    case_id         INTEGER NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    pref            VARCHAR(20),
    city            VARCHAR(50),
    aza             VARCHAR(100),
    chiban          VARCHAR(100),
    chimoku         VARCHAR(30),
    area            NUMERIC(12, 2),
    tenyo_area      NUMERIC(12, 2),
    memo            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_parcels_case_id ON public.case_parcels (case_id);

-- ================================================================
-- 案件金額
-- ================================================================

CREATE TABLE public.case_financials (
    id               SERIAL PRIMARY KEY,
    case_id          INTEGER NOT NULL UNIQUE REFERENCES public.cases(id) ON DELETE CASCADE,
    estimate_amount  BIGINT,
    invoice_amount   BIGINT,
    paid_amount      BIGINT,
    paid_date        DATE,
    tax_rate         NUMERIC(5, 2) DEFAULT 10.00,
    memo             TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- テンプレート（様式）
-- ================================================================

CREATE TABLE public.template_categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.templates (
    id                    SERIAL PRIMARY KEY,
    category_id           INTEGER NOT NULL REFERENCES public.template_categories(id),
    name                  VARCHAR(300) NOT NULL,
    description           TEXT,
    file_type             VARCHAR(10) NOT NULL
                          CHECK (file_type IN ('docx', 'xlsx')),
    file_path             VARCHAR(500) NOT NULL,
    original_file_name    VARCHAR(300),
    version               INTEGER NOT NULL DEFAULT 1,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    applicable_case_types JSONB,
    uploaded_by_user_id   UUID REFERENCES public.users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_templates_category_id ON public.templates (category_id);
CREATE INDEX idx_templates_is_active   ON public.templates (is_active);

CREATE TABLE public.template_mappings (
    id           SERIAL PRIMARY KEY,
    template_id  INTEGER NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
    placeholder  VARCHAR(200) NOT NULL,
    field_path   VARCHAR(200) NOT NULL,
    label        VARCHAR(200),
    is_required  BOOLEAN DEFAULT FALSE,
    sort_order   INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_template_mappings_template_id ON public.template_mappings (template_id);

-- ================================================================
-- 帳票生成履歴
-- ================================================================

CREATE TABLE public.document_histories (
    id                   SERIAL PRIMARY KEY,
    case_id              INTEGER NOT NULL REFERENCES public.cases(id),
    template_id          INTEGER NOT NULL REFERENCES public.templates(id),
    version              INTEGER NOT NULL DEFAULT 1,
    file_name            VARCHAR(500) NOT NULL,
    file_path            VARCHAR(500) NOT NULL,
    file_type            VARCHAR(10) NOT NULL CHECK (file_type IN ('docx', 'xlsx')),
    transferred_data     JSONB,
    highlight_enabled    BOOLEAN DEFAULT TRUE,
    generated_by_user_id UUID REFERENCES public.users(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_histories_case_id     ON public.document_histories (case_id);
CREATE INDEX idx_document_histories_template_id ON public.document_histories (template_id);

-- ================================================================
-- 監査ログ
-- ================================================================

CREATE TABLE public.audit_logs (
    id          SERIAL PRIMARY KEY,
    user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id   INTEGER,
    detail      JSONB,
    ip_address  VARCHAR(45),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id    ON public.audit_logs (user_id);
CREATE INDEX idx_audit_logs_entity     ON public.audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at);

-- ================================================================
-- updated_at 自動更新トリガ
-- ================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at            BEFORE UPDATE ON public.users             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_persons_updated_at          BEFORE UPDATE ON public.persons           FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cases_updated_at            BEFORE UPDATE ON public.cases             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_case_persons_updated_at     BEFORE UPDATE ON public.case_persons      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_case_financials_updated_at  BEFORE UPDATE ON public.case_financials   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_templates_updated_at        BEFORE UPDATE ON public.templates         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================================================================
-- Row Level Security
-- ================================================================

-- ---- users ----
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_self_or_admin ON public.users
    FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY users_update_admin ON public.users
    FOR UPDATE USING (public.is_admin());

-- ---- persons ----
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY persons_select ON public.persons FOR SELECT USING (public.is_active_user());
CREATE POLICY persons_insert ON public.persons FOR INSERT WITH CHECK (public.is_active_user());
CREATE POLICY persons_update ON public.persons FOR UPDATE USING (public.is_active_user());
CREATE POLICY persons_delete ON public.persons FOR DELETE USING (public.is_admin());

-- ---- cases ----
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY cases_select ON public.cases FOR SELECT USING (public.is_active_user());
CREATE POLICY cases_insert ON public.cases FOR INSERT WITH CHECK (public.is_active_user());
CREATE POLICY cases_update ON public.cases FOR UPDATE USING (public.is_active_user());
CREATE POLICY cases_delete ON public.cases FOR DELETE USING (public.is_admin());

-- ---- case_persons / case_parcels / case_financials ----
ALTER TABLE public.case_persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY case_persons_all ON public.case_persons
    FOR ALL USING (public.is_active_user()) WITH CHECK (public.is_active_user());

ALTER TABLE public.case_parcels ENABLE ROW LEVEL SECURITY;
CREATE POLICY case_parcels_all ON public.case_parcels
    FOR ALL USING (public.is_active_user()) WITH CHECK (public.is_active_user());

ALTER TABLE public.case_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY case_financials_all ON public.case_financials
    FOR ALL USING (public.is_active_user()) WITH CHECK (public.is_active_user());

-- ---- templates / mappings / categories ----
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY templates_select ON public.templates FOR SELECT USING (public.is_active_user());
CREATE POLICY templates_write  ON public.templates FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.template_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY template_mappings_select ON public.template_mappings FOR SELECT USING (public.is_active_user());
CREATE POLICY template_mappings_write  ON public.template_mappings FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.template_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY template_categories_select ON public.template_categories FOR SELECT USING (public.is_active_user());
CREATE POLICY template_categories_write  ON public.template_categories FOR ALL
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---- document_histories（履歴の不変性：UPDATE/DELETE 禁止） ----
ALTER TABLE public.document_histories ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_histories_select ON public.document_histories FOR SELECT USING (public.is_active_user());
CREATE POLICY document_histories_insert ON public.document_histories FOR INSERT WITH CHECK (public.is_active_user());

-- ---- audit_logs（参照は admin のみ、INSERT は有効ユーザー） ----
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT USING (public.is_admin());
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT WITH CHECK (public.is_active_user());
