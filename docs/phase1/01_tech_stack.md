# Phase 1-1: 技術スタック・プロジェクト構成

> 本ドキュメントはグラスト共通ルール（`../../CLAUDE.md` §3 標準スタック）に準拠する。
> 逸脱が必要な場合はユーザー承認必須。

---

## 技術スタック（本番）

### アプリケーション

| レイヤー | 採用技術 | バージョン |
|---|---|---|
| フレームワーク | Next.js（App Router） | 15.x |
| 言語 | TypeScript（strict mode） | 5.x |
| UI | React | 19.x |
| スタイリング | Tailwind CSS | v4 |
| UI コンポーネント | shadcn/ui（G-DX トークンでカスタマイズ） | latest |
| フォーム | react-hook-form + zod | 7.x / 3.x |
| データ取得 | **Server Components / Server Actions 第一選択**、必要時のみ TanStack Query | — / 5.x |
| 日時 | date-fns（dayjs / moment 禁止） | 3.x |
| アイコン | lucide-react のみ | latest |

### バックエンド（Supabase）

| レイヤー | 採用技術 |
|---|---|
| DB | Supabase（PostgreSQL 16） |
| 認証 | Supabase Auth（Google Workspace SSO 予定・ドメイン `@n-grust.co.jp` 制限） |
| ストレージ | Supabase Storage（テンプレート原本／生成帳票を保管） |
| マイグレーション | Supabase CLI（`supabase/migrations/*.sql`） |
| 型生成 | `supabase gen types typescript` で DB 型を TS に出力 |

### 帳票転記（Node 版）

| 用途 | ライブラリ |
|---|---|
| Word 差し込み | `docxtemplater`（+ `pizzip`） |
| Excel 差し込み | `exceljs` |
| ハイライト制御 | `docxtemplater` のスタイル保持機能 + `exceljs` のセル塗りつぶし |

> **旧 `.doc` / `.xls` のレガシー様式**はローカル Mac で一度 `.docx` / `.xlsx` に変換してから Supabase Storage に登録する。Vercel ランタイムでは LibreOffice は使わない。

### インフラ

| レイヤー | 採用技術 |
|---|---|
| ホスティング | Vercel |
| リージョン | Supabase: `ap-northeast-1`（東京）／ Vercel: `hnd1`（東京） |
| CI/CD | Vercel 自動デプロイ（GitHub 連携） |
| 監視 | Vercel Analytics + Supabase Logs（初期段階）。Sentry は Phase 5 で検討 |

### テスト / リンタ

| 用途 | 採用技術 |
|---|---|
| ユニット/結合 | Vitest |
| E2E | Playwright |
| Lint | ESLint（`next/core-web-vitals`） |
| Format | Prettier |

---

## プロジェクトディレクトリ構成

```
dreams/
├── .env.local                         ← gitignore
├── .env.example                       ← 公開テンプレート
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── package.json
├── pnpm-lock.yaml
├── vitest.config.ts
├── playwright.config.ts
│
├── supabase/
│   ├── migrations/                    ← SQL マイグレーション（02_db_schema.md から起こす）
│   │   └── 0001_initial_schema.sql
│   ├── seed.sql                       ← 初期データ（カテゴリ・管理者など）
│   └── config.toml
│
├── src/
│   ├── app/                           ← App Router
│   │   ├── layout.tsx                 ← ルートレイアウト（AppHeader + SideNav）
│   │   ├── page.tsx                   ← ダッシュボード
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── callback/route.ts      ← Supabase Auth コールバック
│   │   ├── (dashboard)/
│   │   │   ├── persons/               ← 人マスタ
│   │   │   ├── cases/                 ← 案件マスタ
│   │   │   ├── templates/             ← テンプレ管理（admin 限定）
│   │   │   ├── documents/             ← 帳票生成履歴
│   │   │   └── audit-logs/            ← 監査ログ（admin 限定）
│   │   └── api/                       ← Route Handlers（外部向け API のみ）
│   │       └── documents/
│   │           └── [id]/download/route.ts
│   │
│   ├── server/                        ← Server Actions（"use server"）
│   │   ├── persons.ts
│   │   ├── cases.ts
│   │   ├── templates.ts
│   │   ├── documents.ts
│   │   └── audit.ts
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts              ← Server Component / Action 用クライアント
│   │   │   ├── client.ts              ← Client Component 用クライアント
│   │   │   ├── middleware.ts          ← セッション更新ミドルウェア
│   │   │   └── admin.ts               ← service_role キー用（Server Action 限定）
│   │   ├── transfer/
│   │   │   ├── engine.ts              ← 帳票転記エンジン本体
│   │   │   ├── context-builder.ts     ← TransferContext 組み立て
│   │   │   ├── docx.ts                ← docxtemplater ラッパー
│   │   │   ├── xlsx.ts                ← exceljs ラッパー
│   │   │   └── wareki.ts              ← 和暦変換
│   │   ├── audit.ts                   ← 監査ログ記録ヘルパ
│   │   ├── permissions.ts             ← ロールチェック
│   │   └── validators/                ← zod スキーマ
│   │
│   ├── components/
│   │   ├── ui/                        ← shadcn/ui
│   │   ├── layout/
│   │   │   ├── app-header.tsx
│   │   │   └── side-nav.tsx
│   │   ├── persons/
│   │   ├── cases/
│   │   ├── templates/
│   │   └── documents/
│   │
│   ├── styles/
│   │   └── globals.css                ← デザイントークン CSS 変数定義
│   │
│   ├── types/
│   │   ├── database.ts                ← supabase gen types の出力
│   │   └── transfer.ts                ← TransferContext 型
│   │
│   └── middleware.ts                  ← Supabase Auth セッション同期
│
├── tests/
│   ├── unit/
│   └── e2e/
│
├── scripts/
│   ├── convert-legacy-templates.ts    ← ローカルで旧 .doc/.xls → .docx/.xlsx 変換の手順書
│   └── seed-demo-data.ts
│
└── docs/                              ← 本 claude_code_docs（symlink or 別管理）
```

> **monorepo 化は当面しない。** 将来 g-dx_kanri 等と共有パッケージが必要になったタイミングで再検討。

---

## パッケージ（主要）

```jsonc
// package.json — 主要依存のみ抜粋
{
  "dependencies": {
    "next": "^15",
    "react": "^19",
    "react-dom": "^19",
    "@supabase/ssr": "latest",
    "@supabase/supabase-js": "latest",
    "react-hook-form": "^7",
    "@hookform/resolvers": "^3",
    "zod": "^3",
    "date-fns": "^3",
    "lucide-react": "latest",
    "docxtemplater": "^3",
    "pizzip": "^3",
    "exceljs": "^4",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "tailwind-merge": "latest"
  },
  "devDependencies": {
    "typescript": "^5",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4",
    "eslint": "^9",
    "eslint-config-next": "^15",
    "prettier": "^3",
    "vitest": "^2",
    "@playwright/test": "^1",
    "supabase": "latest"
  }
}
```

> **勝手に別ライブラリを入れない**（CLAUDE.md §3, §7.3）。追加が必要な場合は事前にユーザー承認。

---

## 環境変数（.env.example）

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Server Action / Route Handler 専用（ブラウザに露出させない）
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# アプリ
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# 帳票出力（Supabase Storage バケット名）
STORAGE_BUCKET_TEMPLATES=templates
STORAGE_BUCKET_DOCUMENTS=documents
```

- `.env.local` は gitignore 済み。
- 本番値は Vercel の Environment Variables に登録する。
- `SUPABASE_SERVICE_ROLE_KEY` は Server 側のみで使用し、Client Component からはアクセスしない。

---

## セットアップ手順（ローカル）

```bash
# 1. リポジトリクローン
git clone <repo_url> dreams
cd dreams

# 2. 依存インストール
pnpm install

# 3. 環境変数
cp .env.example .env.local
# .env.local を編集（Supabase ダッシュボードの値を貼り付け）

# 4. Supabase CLI ログイン & リンク
pnpm dlx supabase login
pnpm dlx supabase link --project-ref <project-ref>

# 5. マイグレーション適用（DB スキーマ）
pnpm dlx supabase db push

# 6. 型生成
pnpm dlx supabase gen types typescript --linked > src/types/database.ts

# 7. 初期データ投入
pnpm dlx supabase db execute --file supabase/seed.sql

# 8. 開発サーバ起動
pnpm dev
# → http://localhost:3000
```

---

## デプロイ手順（本番）

1. GitHub リポジトリを Vercel にインポート
2. Vercel の Environment Variables に `.env.local` と同じキーを登録
3. Supabase Dashboard → Authentication → URL Configuration に Vercel の URL を追加
4. `main` ブランチへの push で自動デプロイ
5. マイグレーションは CI or 手動で `supabase db push`

詳細は `phase5/13_deployment.md` を参照。

---

## デモシステム（Manus 稼働）からの主要変更点

| 項目 | デモ | 本番（本ドキュメント） |
|---|---|---|
| Backend | Python 3.12 + FastAPI | **Next.js 15（Server Actions + Route Handlers）** |
| Frontend | React 18 + Vite + Wouter | **Next.js 15（App Router）+ React 19** |
| DB | MySQL (Drizzle) / PostgreSQL (Docker) | **Supabase（PostgreSQL マネージド）** |
| 認証 | 独自 JWT（python-jose） | **Supabase Auth** |
| 帳票転記 | python-docx + docxtpl + openpyxl | **docxtemplater + exceljs（Node）** |
| .doc/.xls 変換 | LibreOffice headless（ランタイム） | **ローカル Mac で前処理のみ**（ランタイムでは不使用） |
| Storage | ローカルボリューム / S3 | **Supabase Storage** |
| ダッシュボード | LarkBase 連携前提 | **Next.js 側に内製** |
| デプロイ | Docker Compose + Nginx | **Vercel** |

変更理由は `/Users/shojiyuya/.claude/projects/.../memory/project_dreams_stack.md` に記録。
