# Phase 1-2: データベーススキーマ設計

## 設計方針

本システムのDBは以下の3つの原則に基づいて設計されています。

**スナップショット方式による過去データ保護：** 案件に紐付けた関係者情報は、人マスタとは独立したスナップショットとして保持します。マスタを後日修正しても、過去の案件・生成済み帳票には影響しません。ユーザーが明示的に「マスタから再同期」を実行した場合のみ更新されます。

**監査ログの完全性：** 誰がいつ何を変更したか、どの様式を生成したかをすべて記録します。帳票生成時には転記した値のスナップショットも保存します。

**テンプレート原本の不変性：** テンプレートファイルは上書き禁止です。新しいファイルをアップロードした場合は新バージョンとして登録し、旧バージョンは参照可能な状態で保持します。

---

## ER図（概要）

```
users
  └─ cases (assignedUserId)
       ├─ case_persons (caseId) ─── persons (personId, snapshot)
       ├─ case_parcels (caseId)
       ├─ case_financials (caseId)
       └─ document_histories (caseId) ─── templates (templateId)

templates
  ├─ template_categories (categoryId)
  └─ template_mappings (templateId)

audit_logs (userId, entityType, entityId)

location_areas
  └─ location_prefectures (areaId)
       └─ location_municipalities (prefectureId)
```

---

## テーブル定義

### users（ユーザー）— Supabase Auth と連動

Supabase Auth（`auth.users`）を権威とし、アプリ固有のメタデータ（氏名・ロール・有効状態など）を `public.users` に保持する。`id` は `auth.users.id`（UUID）と同値にする。

```sql
CREATE TABLE public.users (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT NOT NULL UNIQUE,       -- auth.users.email と同期
    full_name       TEXT,
    role            TEXT NOT NULL DEFAULT 'user'
                    CHECK (role IN ('admin', 'user')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_signed_in  TIMESTAMPTZ
);

-- 新規 Auth ユーザー作成時に public.users に自動追加するトリガ
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

> パスワードハッシュは Supabase Auth が管理するため `hashed_password` は保持しない。SSO（Google Workspace）を採用する場合は `auth.identities` 側で管理される。

### persons（人マスタ）

住所は都道府県・市区町村・町域・番地・建物名に分割して保持します。連結表示は API レイヤーで生成します。

```sql
CREATE TABLE persons (
    id                  SERIAL PRIMARY KEY,
    person_type         VARCHAR(20) NOT NULL DEFAULT 'individual',
                        -- 'individual' | 'corporation'
    -- 氏名・法人名
    name                VARCHAR(200) NOT NULL,
    name_kana           VARCHAR(200),
    -- 住所（分割保持）
    zip                 VARCHAR(10),
    address_pref        VARCHAR(20),   -- 都道府県
    address_city        VARCHAR(50),   -- 市区町村
    address_town        VARCHAR(100),  -- 町域・大字
    address_line1       VARCHAR(200),  -- 番地
    address_line2       VARCHAR(200),  -- 建物名・部屋番号
    -- 連絡先
    phone               VARCHAR(30),
    fax                 VARCHAR(30),
    email               VARCHAR(320),
    -- 法人追加情報
    corporate_number    VARCHAR(20),   -- 法人番号
    representative_name VARCHAR(200),  -- 代表者氏名
    -- 重複候補検出用（正規化済み文字列）
    name_normalized     VARCHAR(200),  -- 氏名の正規化（全角→半角、スペース除去）
    memo                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 検索用インデックス
CREATE INDEX idx_persons_name ON persons(name);
CREATE INDEX idx_persons_name_kana ON persons(name_kana);
CREATE INDEX idx_persons_zip ON persons(zip);
CREATE INDEX idx_persons_name_normalized ON persons(name_normalized);
```

### cases（案件）

```sql
CREATE TABLE cases (
    id                  SERIAL PRIMARY KEY,
    case_number         VARCHAR(50) NOT NULL UNIQUE,
                        -- 自動採番: YYYY-{種別コード}-{連番3桁}
                        -- 例: 2024-FC-001 (FC=farmland_conversion)
    case_name           VARCHAR(300) NOT NULL,
    case_type           VARCHAR(50) NOT NULL,
                        -- 'land_improvement'    土地改良区
                        -- 'boundary_survey'     境界確定測量
                        -- 'building_permit'     建築許可
                        -- 'farmland_conversion' 農地転用許可
                        -- 'other'
    status              VARCHAR(30) NOT NULL DEFAULT 'inquiry',
                        -- 'inquiry'     問い合わせ
                        -- 'in_progress' 進行中
                        -- 'submitted'   提出済み
                        -- 'approved'    承認済み
                        -- 'completed'   完了
                        -- 'cancelled'   取消
    assigned_user_id    UUID REFERENCES public.users(id),
    submission_target   VARCHAR(200),  -- 提出先
    submission_date     DATE,          -- 提出日
    deadline_date       DATE,          -- 締切日
    memo                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cases_case_number ON cases(case_number);
CREATE INDEX idx_cases_case_type ON cases(case_type);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_deadline_date ON cases(deadline_date);
CREATE INDEX idx_cases_assigned_user_id ON cases(assigned_user_id);
```

**案件番号の採番ルール：**

| 案件種別 | コード | 例 |
|---------|--------|-----|
| 土地改良区 | LI | 2024-LI-001 |
| 境界確定測量 | BS | 2024-BS-001 |
| 建築許可 | BP | 2024-BP-001 |
| 農地転用許可 | FC | 2024-FC-001 |
| その他 | OT | 2024-OT-001 |

### case_persons（案件関係者・スナップショット）

人マスタから案件に紐付けた時点の値をスナップショットとして保持します。

```sql
CREATE TABLE case_persons (
    id                      SERIAL PRIMARY KEY,
    case_id                 INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    person_id               INTEGER REFERENCES persons(id) ON DELETE SET NULL,
                            -- NULLの場合はマスタ削除済み（スナップショットは残る）
    role                    VARCHAR(30) NOT NULL,
                            -- 'applicant'  申請者
                            -- 'transferee' 譲受人
                            -- 'transferor' 譲渡人
                            -- 'agent'      代理人/行政書士
                            -- 'billing'    請求先
                            -- 'neighbor'   隣地所有者
                            -- 'other'
    sort_order              INTEGER NOT NULL DEFAULT 0,
    -- スナップショット（マスタ変更の影響を受けない）
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
    snapshot_at             TIMESTAMPTZ,  -- スナップショット取得日時
    memo                    TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_persons_case_id ON case_persons(case_id);
CREATE INDEX idx_case_persons_person_id ON case_persons(person_id);
```

### case_parcels（案件土地情報・複数筆対応）

```sql
CREATE TABLE case_parcels (
    id              SERIAL PRIMARY KEY,
    case_id         INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    -- 所在地
    pref            VARCHAR(20),   -- 都道府県
    city            VARCHAR(50),   -- 市区町村
    aza             VARCHAR(100),  -- 大字・字
    chiban          VARCHAR(100),  -- 地番
    -- 地目・面積
    chimoku         VARCHAR(30),   -- 地目（田・畑・宅地など）
    area            NUMERIC(12,2), -- 地積（㎡）
    tenyo_area      NUMERIC(12,2), -- 転用面積（㎡）
    memo            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_parcels_case_id ON case_parcels(case_id);
```

### case_financials（案件金額情報）

```sql
CREATE TABLE case_financials (
    id               SERIAL PRIMARY KEY,
    case_id          INTEGER NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
    estimate_amount  BIGINT,        -- 見積金額（税抜）
    invoice_amount   BIGINT,        -- 請求金額（税抜）
    paid_amount      BIGINT,        -- 入金金額
    paid_date        DATE,          -- 入金日
    tax_rate         NUMERIC(5,2) DEFAULT 10.00,  -- 消費税率
    memo             TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### location_areas / location_prefectures / location_municipalities（エリア・都道府県・市町村マスタ）

様式の提出先や適用範囲の分類、将来的な住所入力補助に使う参照マスタです。階層は
`エリア > 都道府県 > 市町村` の 3 段構成とし、各階層で `display_order` により表示順を制御します。

```sql
CREATE TABLE location_areas (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    code          VARCHAR(50) NOT NULL UNIQUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE location_prefectures (
    id            SERIAL PRIMARY KEY,
    area_id       INTEGER NOT NULL REFERENCES location_areas(id) ON DELETE CASCADE,
    name          VARCHAR(20) NOT NULL,
    code          VARCHAR(50) NOT NULL UNIQUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (area_id, name)
);

CREATE TABLE location_municipalities (
    id            SERIAL PRIMARY KEY,
    prefecture_id INTEGER NOT NULL REFERENCES location_prefectures(id) ON DELETE CASCADE,
    name          VARCHAR(50) NOT NULL,
    code          VARCHAR(50) NOT NULL UNIQUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (prefecture_id, name)
);
```

初期データは以下です。

```sql
INSERT INTO location_areas (name, code, display_order) VALUES
    ('東三河エリア', 'east_mikawa', 1),
    ('浜松・湖西エリア', 'hamamatsu_kosai', 2);

INSERT INTO location_prefectures (area_id, name, code, display_order) VALUES
    -- 東三河エリア
    (<east_mikawa の id>, '愛知県', 'aichi', 1),
    -- 浜松・湖西エリア
    (<hamamatsu_kosai の id>, '静岡県', 'shizuoka', 1);

INSERT INTO location_municipalities (prefecture_id, name, code, display_order) VALUES
    (<aichi の id>, '豊橋市', 'toyohashi_city', 1),
    (<aichi の id>, '豊川市', 'toyokawa_city', 2),
    (<aichi の id>, '蒲郡市', 'gamagori_city', 3),
    (<aichi の id>, '新城市', 'shinshiro_city', 4),
    (<aichi の id>, '田原市', 'tahara_city', 5),
    (<aichi の id>, '設楽町', 'shitara_town', 6),
    (<aichi の id>, '東栄町', 'toei_town', 7),
    (<aichi の id>, '豊根村', 'toyone_village', 8),
    (<shizuoka の id>, '浜松市', 'hamamatsu_city', 1),
    (<shizuoka の id>, '湖西市', 'kosai_city', 2);
```

### template_categories（様式カテゴリ）

```sql
CREATE TABLE template_categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 初期データ
INSERT INTO template_categories (name, slug, sort_order) VALUES
    ('土地改良区',     'land_improvement',    1),
    ('境界確定測量',   'boundary_survey',     2),
    ('建築許可',       'building_permit',     3),
    ('農地転用許可',   'farmland_conversion', 4);
```

### templates（帳票テンプレート）

```sql
CREATE TABLE templates (
    id                    SERIAL PRIMARY KEY,
    category_id           INTEGER NOT NULL REFERENCES template_categories(id),
    name                  VARCHAR(300) NOT NULL,
    description           TEXT,
    file_type             VARCHAR(10) NOT NULL,
                          -- 'docx' | 'xlsx'（doc/xlsは変換後に登録）
    file_path             VARCHAR(500) NOT NULL,  -- ストレージ内パス
    original_file_name    VARCHAR(300),
    version               INTEGER NOT NULL DEFAULT 1,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    applicable_case_types JSONB,
                          -- 例: ["farmland_conversion", "land_improvement"]
    uploaded_by_user_id   UUID REFERENCES public.users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_templates_category_id ON templates(category_id);
CREATE INDEX idx_templates_is_active ON templates(is_active);
```

### template_mappings（テンプレートフィールドマッピング）

```sql
CREATE TABLE template_mappings (
    id           SERIAL PRIMARY KEY,
    template_id  INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    placeholder  VARCHAR(200) NOT NULL,
                 -- Word: {{applicant.name}}
                 -- Excel: セル座標 B5 または 名前定義 applicant_name
    field_path   VARCHAR(200) NOT NULL,
                 -- 例: applicant.name, parcels[0].chiban
    label        VARCHAR(200),   -- 表示名（例: 申請者氏名）
    is_required  BOOLEAN DEFAULT FALSE,
    sort_order   INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_template_mappings_template_id ON template_mappings(template_id);
```

### document_histories（帳票生成履歴）

```sql
CREATE TABLE document_histories (
    id                  SERIAL PRIMARY KEY,
    case_id             INTEGER NOT NULL REFERENCES cases(id),
    template_id         INTEGER NOT NULL REFERENCES templates(id),
    version             INTEGER NOT NULL DEFAULT 1,
    -- ファイル命名規則: {案件番号}_{様式名}_{YYYYMMDD}_v{連番}.docx
    file_name           VARCHAR(500) NOT NULL,
    file_path           VARCHAR(500) NOT NULL,
    file_type           VARCHAR(10) NOT NULL,  -- 'docx' | 'xlsx'
    -- 転記時のスナップショット（どの値を転記したか）
    transferred_data    JSONB,
    highlight_enabled   BOOLEAN DEFAULT TRUE,
    generated_by_user_id UUID REFERENCES public.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_histories_case_id ON document_histories(case_id);
CREATE INDEX idx_document_histories_template_id ON document_histories(template_id);
```

### audit_logs（監査ログ）

```sql
CREATE TABLE audit_logs (
    id          SERIAL PRIMARY KEY,
    user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action      VARCHAR(100) NOT NULL,
                -- 'case.create' | 'case.update' | 'case.delete'
                -- 'person.create' | 'person.update' | 'person.delete'
                -- 'document.generate' | 'template.upload'
                -- 'person.resync'（マスタ再同期）
    entity_type VARCHAR(50),   -- 'case' | 'person' | 'template' | 'document'
    entity_id   INTEGER,
    detail      JSONB,         -- 変更前後の値など
    ip_address  VARCHAR(45),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

---

## RLS（Row Level Security）ポリシー

**全テーブルで RLS を有効化**する（CLAUDE.md §6「機微情報は RLS ＋アプリ層で二重防衛」）。

### ヘルパ関数

```sql
-- 現在ログインユーザーのロールを取得
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
    SELECT role FROM public.users WHERE id = auth.uid() AND is_active = TRUE;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 管理者判定
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT public.current_user_role() = 'admin';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 認証済みかつ有効アカウント判定
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND is_active = TRUE
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### ポリシー定義

```sql
-- ==== users ====
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_self_or_admin ON public.users
    FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY users_update_admin ON public.users
    FOR UPDATE USING (public.is_admin());

-- ==== persons / cases / case_persons / case_parcels / case_financials ====
-- 読み取り・作成・更新は有効ユーザー全員、削除は admin のみ
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

CREATE POLICY persons_select ON public.persons
    FOR SELECT USING (public.is_active_user());

CREATE POLICY persons_insert ON public.persons
    FOR INSERT WITH CHECK (public.is_active_user());

CREATE POLICY persons_update ON public.persons
    FOR UPDATE USING (public.is_active_user());

CREATE POLICY persons_delete ON public.persons
    FOR DELETE USING (public.is_admin());

-- cases / case_persons / case_parcels / case_financials も同パターン
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY cases_select ON public.cases FOR SELECT USING (public.is_active_user());
CREATE POLICY cases_insert ON public.cases FOR INSERT WITH CHECK (public.is_active_user());
CREATE POLICY cases_update ON public.cases FOR UPDATE USING (public.is_active_user());
CREATE POLICY cases_delete ON public.cases FOR DELETE USING (public.is_admin());

ALTER TABLE public.case_persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY case_persons_all ON public.case_persons
    FOR ALL USING (public.is_active_user()) WITH CHECK (public.is_active_user());

ALTER TABLE public.case_parcels ENABLE ROW LEVEL SECURITY;
CREATE POLICY case_parcels_all ON public.case_parcels
    FOR ALL USING (public.is_active_user()) WITH CHECK (public.is_active_user());

ALTER TABLE public.case_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY case_financials_all ON public.case_financials
    FOR ALL USING (public.is_active_user()) WITH CHECK (public.is_active_user());

-- ==== templates / template_mappings / template_categories ====
-- 参照は全員、書き込みは admin のみ
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY templates_select ON public.templates FOR SELECT USING (public.is_active_user());
CREATE POLICY templates_write ON public.templates FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.template_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY template_mappings_select ON public.template_mappings FOR SELECT USING (public.is_active_user());
CREATE POLICY template_mappings_write ON public.template_mappings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.template_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY template_categories_select ON public.template_categories FOR SELECT USING (public.is_active_user());
CREATE POLICY template_categories_write ON public.template_categories FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ==== location_areas / location_prefectures / location_municipalities ====
ALTER TABLE public.location_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY location_areas_select ON public.location_areas FOR SELECT USING (public.is_active_user());
CREATE POLICY location_areas_write ON public.location_areas FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.location_prefectures ENABLE ROW LEVEL SECURITY;
CREATE POLICY location_prefectures_select ON public.location_prefectures FOR SELECT USING (public.is_active_user());
CREATE POLICY location_prefectures_write ON public.location_prefectures FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.location_municipalities ENABLE ROW LEVEL SECURITY;
CREATE POLICY location_municipalities_select ON public.location_municipalities FOR SELECT USING (public.is_active_user());
CREATE POLICY location_municipalities_write ON public.location_municipalities FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ==== document_histories ====
-- 参照・INSERT は全員、UPDATE / DELETE は禁止（履歴の不変性）
ALTER TABLE public.document_histories ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_histories_select ON public.document_histories FOR SELECT USING (public.is_active_user());
CREATE POLICY document_histories_insert ON public.document_histories FOR INSERT WITH CHECK (public.is_active_user());
-- UPDATE / DELETE のポリシーを作らない（= 拒否）

-- ==== audit_logs ====
-- 参照は admin のみ、INSERT は全員（Server Action からのみ、後続トリガで自動記録）
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT USING (public.is_admin());
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT WITH CHECK (public.is_active_user());
-- UPDATE / DELETE のポリシーを作らない（= 拒否）
```

> **service_role キーは Server Action / Route Handler からのみ使用**する。ブラウザに露出させない。RLS はブラウザからの直接アクセス（anon キー）に対する防衛であり、アプリ層での権限チェックと二重防衛にする。

---

## Supabase Storage 構成

| バケット | 用途 | アクセス |
|---|---|---|
| `templates` | テンプレート原本（`.docx` / `.xlsx`） | 認証済みのみ閲覧、書き込みは admin |
| `documents` | 生成済み帳票 | 認証済みのみ閲覧・書き込み |

ファイルパス規約：
- テンプレート：`templates/{category_slug}/{template_id}_v{version}.{docx|xlsx}`
- 生成帳票：`documents/{case_number}/{case_number}_{safe_template_name}_{YYYYMMDD}_v{n}.{docx|xlsx}`

---

## マイグレーション手順（Supabase CLI）

```bash
# 新しいマイグレーション作成
pnpm dlx supabase migration new add_xxx

# supabase/migrations/ に SQL ファイルを書く

# ローカルでテスト
pnpm dlx supabase db reset

# リモート（本番）に適用
pnpm dlx supabase db push

# 適用済みマイグレーションの確認
pnpm dlx supabase migration list --linked
```

> 本番 DB への破壊的操作（drop / truncate / reset）はユーザー承認なしに実行しない（CLAUDE.md §6, §7.3）。

---

## 重要な設計メモ

**スナップショット再同期の実装：** `case_persons` テーブルの `person_id` が NULL でない場合、Server Action `resyncCasePerson(casePersonId)` を呼び出して現在の人マスタの値をスナップショットフィールドに上書きする。この操作は `audit_logs` に `person.resync` として記録する。

**重複候補検出：** `persons.name_normalized` に氏名の正規化文字列（全角→半角、スペース除去、カタカナ統一）を保存し、新規登録時に pg_trgm の類似度検索でサジェストする。拡張の有効化：

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_persons_name_normalized_trgm
    ON public.persons USING gin (name_normalized gin_trgm_ops);
```

**案件番号の採番：** `cases` への INSERT 時に `case_type` と年度から自動採番。年度ごとの連番を取る専用関数を Postgres 側に置いて競合を防ぐ。

```sql
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
```

**監査ログの記録：** アプリ層（Server Action）で `insert into audit_logs` を明示的に呼ぶ。DB トリガで自動記録する方式は採らない（誰の操作かを `auth.uid()` で取るのがトリガ内では不安定なため）。
