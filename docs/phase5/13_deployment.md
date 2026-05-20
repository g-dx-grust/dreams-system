# Phase 5-3: デプロイ・バックアップ手順

## インフラ構成（本番）

```
┌─────────────────────────────────────────────────────┐
│  End User (@n-grust.co.jp)                           │
│    ↓ HTTPS                                           │
│  Vercel (hnd1 / 東京)                                │
│    ├─ Next.js App Router                             │
│    │   ├─ Server Components                          │
│    │   ├─ Server Actions                             │
│    │   └─ Route Handlers (帳票 DL など)                │
│    └─ Edge Middleware（Supabase Auth セッション同期）  │
│       ↓ HTTPS                                        │
│  Supabase (ap-northeast-1 / 東京)                    │
│    ├─ PostgreSQL 16                                  │
│    ├─ Auth（Google Workspace SSO）                    │
│    └─ Storage（templates / documents バケット）        │
└─────────────────────────────────────────────────────┘
```

**Python サイドカーなし / LibreOffice なし / Docker なし**。

---

## Vercel セットアップ

### プロジェクト作成

1. GitHub リポジトリを Vercel にインポート
2. Framework Preset：**Next.js**（自動検出）
3. Root Directory：`.`（リポジトリルート）
4. Build Command：`pnpm build`
5. Install Command：`pnpm install`
6. Output Directory：デフォルト（`.next`）

### Environment Variables

以下を **Production / Preview / Development** で個別に設定する。

| キー | Production | Preview | Development |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 本番 Supabase URL | 開発 Supabase URL | 開発 Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 本番 anon | 開発 anon | 開発 anon |
| `SUPABASE_SERVICE_ROLE_KEY` | 本番 service_role | 開発 service_role | 開発 service_role |
| `NEXT_PUBLIC_APP_URL` | `https://dreams.grust.jp`（例） | `https://<preview-url>.vercel.app` | `http://localhost:3000` |
| `STORAGE_BUCKET_TEMPLATES` | `templates` | `templates` | `templates` |
| `STORAGE_BUCKET_DOCUMENTS` | `documents` | `documents` | `documents` |

- **`SUPABASE_SERVICE_ROLE_KEY` はブラウザに露出させない** — Vercel の Environment Variables で「Sensitive」にマーク。Client Component からは絶対に import しない。
- 本番 Supabase プロジェクトと開発 Supabase プロジェクトは分ける。

### リージョン設定

`next.config.ts` で東京リージョンを優先：

```ts
// next.config.ts
export default {
  experimental: {
    // Route Handlers / Server Actions を東京に固定（帳票生成のレイテンシ最小化）
  },
};
```

Vercel の Project Settings → Functions → Region：**hnd1（Tokyo）** を選択。

---

## Supabase セットアップ

### プロジェクト作成

1. Supabase Dashboard で「New Project」
2. Region：**Tokyo (ap-northeast-1)**
3. Database Password を生成・保管（`SUPABASE_SERVICE_ROLE_KEY` とは別物）
4. Plan：Free から開始。本番運用開始後に Pro へアップグレード（PITR バックアップ有効化のため）

### マイグレーション適用

```bash
# ローカルで CLI にログイン
pnpm dlx supabase login

# プロジェクトとリンク
pnpm dlx supabase link --project-ref <project-ref>

# マイグレーション適用
pnpm dlx supabase db push

# シードデータ投入
pnpm dlx supabase db execute --file supabase/seed.sql

# 型生成
pnpm dlx supabase gen types typescript --linked > src/types/database.ts
```

### Auth 設定

1. Authentication → Providers → **Google** を Enable
   - Client ID / Secret：Google Cloud Console で OAuth クライアントを作成して取得
   - Authorized redirect URL：`https://<project-ref>.supabase.co/auth/v1/callback`
2. Authentication → URL Configuration
   - Site URL：`https://dreams.grust.jp`（本番）
   - Redirect URLs：`https://dreams.grust.jp/callback`, `http://localhost:3000/callback` ほか Preview 用 URL
3. Authentication → Email Templates：日本語に書き換え（招待メールなど）
4. ドメイン制限：ログインページ側の `queryParams.hd = "n-grust.co.jp"` で第一防衛。第二防衛として Supabase Auth webhook でメールドメインを検証し、不一致なら即 `is_active = false` にするフックを `phase5/11_auth_permissions.md` で検討。

### Storage 設定

Storage → Create bucket：

- `templates`：Private、ファイルサイズ上限 50MB、MIME 制限 `.docx` / `.xlsx` のみ
- `documents`：Private、ファイルサイズ上限 50MB

バケットのアクセスポリシーは RLS で制御（`02_db_schema.md` 参照）。

---

## CI/CD

### ブランチ戦略

| ブランチ | 環境 | デプロイ |
|---|---|---|
| `main` | Production | Vercel Production（自動） |
| その他（PR） | Preview | Vercel Preview（自動、PR ごとに URL 発行） |
| ローカル | Development | `pnpm dev` |

### PR 時の自動チェック

`.github/workflows/ci.yml`（GitHub Actions）で以下を実行：

```yaml
name: CI
on: [pull_request, push]
jobs:
  lint-type-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check      # "tsc --noEmit"
      - run: pnpm test            # vitest
      # - run: pnpm e2e            # playwright（Preview URL が必要なため初期は省略）
```

### DB マイグレーションのデプロイ

**自動適用はしない**（本番 DB への破壊的変更を防ぐ）。以下の手順で手動適用：

1. PR で `supabase/migrations/*.sql` を追加
2. Preview 環境で動作確認（Preview 用 Supabase プロジェクトに対して `supabase db push`）
3. レビュー・承認後に `main` へマージ
4. 開発者がローカルから本番に対して `supabase db push --linked`（リンク先が本番になっていることを必ず確認）
5. 適用後、`supabase migration list --linked` で結果を確認

> 破壊的操作（`DROP`, `TRUNCATE`, `ALTER TABLE ... DROP COLUMN` など）はユーザー承認必須（CLAUDE.md §6, §7.3）。

---

## バックアップ

### データベース

- **Supabase Free プラン**：7 日間の自動バックアップあり、PITR なし
- **Supabase Pro プラン**（本番運用では Pro 以上推奨）：7 日間の PITR（ポイントインタイムリカバリ）
- **追加対策**：重要テーブルの日次ダンプを別ストレージ（S3 互換 or ローカル）に保管するスクリプトを用意

```bash
# scripts/backup-db.sh
pg_dump "$SUPABASE_DB_URL" --data-only --no-owner \
  --table=public.cases \
  --table=public.persons \
  --table=public.case_persons \
  --table=public.case_parcels \
  --table=public.case_financials \
  --table=public.templates \
  --table=public.template_mappings \
  --table=public.document_histories \
  --table=public.audit_logs \
  > "backup/dreams_$(date +%Y%m%d).sql"
```

実行タイミング：日次（手動 or GitHub Actions スケジュール）。

### Storage

Supabase Storage はマネージドで冗長化されているが、テンプレート原本と生成済み帳票は**別途 S3 等に日次同期**することを推奨（月次程度から開始）。

---

## 監視

### 初期段階（無料で始める）

- **Vercel Analytics**：Web Vitals、エラー率
- **Supabase Logs**：DB スロークエリ、Auth イベント
- **Supabase Dashboard → Reports**：DB 使用量、API リクエスト数

### Phase 5 後半で追加検討

- **Sentry**：エラートラッキング（Next.js 用の SDK あり）
- **アラート**：重要エラー（帳票生成失敗など）を Slack に通知

---

## 本番切り替えチェックリスト

デモ運用 → 本番運用への切り替え時に確認すること。

- [ ] 本番用 Supabase プロジェクトを作成し、マイグレーション適用済み
- [ ] 初期管理者（`shoji@n-grust.co.jp` など）を `auth.users` に登録し、`public.users.role = 'admin'` に設定
- [ ] Google OAuth 設定で本番 Vercel URL を redirect URL に追加
- [ ] Supabase Auth → URL Configuration に本番 URL を追加
- [ ] Storage バケット（`templates` / `documents`）を作成し、RLS ポリシー確認
- [ ] Vercel Environment Variables（Production）を設定
- [ ] カスタムドメイン（`dreams.grust.jp` など）を Vercel に設定（DNS 向き先も）
- [ ] テンプレート原本をローカルで `.docx` / `.xlsx` に前変換し、`templates` バケットにアップロード
- [ ] サンプル案件を 1 件作成し、帳票生成が成功することを確認
- [ ] 監査ログが正しく記録されていることを確認
- [ ] 社内アクセス制限（Cloudflare Access など）の方針が決まっていれば適用

---

## ロールバック手順

### アプリケーション

Vercel の Deployments 画面から 1 クリックで「Promote to Production」によって以前のデプロイに戻せる。

### データベース

- **Supabase Pro**：PITR で秒単位に戻せる
- **Free**：直近の自動バックアップまで戻せる
- **Dump からの復元**：`psql "$SUPABASE_DB_URL" < backup/dreams_YYYYMMDD.sql`

ただし、**テーブル単位の部分復元**が必要なケースが多いので、実運用では「特定行の UPDATE / INSERT SQL を復元する」スクリプトを用意する方が実用的。

---

## コスト見積（目安、2026-04 時点）

| サービス | プラン | 月額目安 |
|---|---|---|
| Vercel | Hobby → Pro（本番運用時） | $0 → $20 |
| Supabase | Free → Pro（本番運用時） | $0 → $25 |
| Google Workspace | 既存利用 | ー |
| （オプション）Cloudflare Access | 〜50 ユーザー | $0 |
| （オプション）Sentry | Free プラン | $0 |

**初期は Free プラン組み合わせで月額 $0 から開始、本番運用開始時に Pro $45/月想定**。
