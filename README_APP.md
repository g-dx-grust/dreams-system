# 案件管理・帳票転記システム（kanri-system）

測量業務（農地転用許可・境界確定測量・建築許可・土地改良区）の案件管理と帳票自動転記を一元化する業務システム。

**コアコンセプト：「入力は 1 回だけ」**

---

## クイックスタート（ローカル開発）

```bash
# 1. 依存インストール
pnpm install

# 2. 環境変数
cp .env.example .env.local
# .env.local を編集（Supabase ダッシュボードの値を貼り付け）

# 3. Supabase CLI ログイン & リンク
pnpm dlx supabase login
pnpm dlx supabase link --project-ref <project-ref>

# 4. マイグレーション適用
pnpm dlx supabase db push

# 5. DB 型生成
pnpm db:types

# 6. 初期データ投入
pnpm dlx supabase db execute --file supabase/seed.sql

# 7. 開発サーバ起動
pnpm dev
```

## 開発チェック

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

---

## 参照ドキュメント

- **グラスト共通ルール**: [CLAUDE.md](./CLAUDE.md)（最優先）
- **デザインシステム**: [G-DX_Design_System.md](./G-DX_Design_System.md)（正本）
- **本システム要件**: [docs/README.md](./docs/README.md)

---

## 様式の一括登録

`docs/様式` 配下の `.docx` / `.xlsx` を Supabase Storage と `templates` テーブルへまとめて登録できます。

```bash
# 内容確認だけ
pnpm templates:import --dry-run

# 実登録
pnpm templates:import
```

カテゴリ配下にさらにフォルダがある場合は、そのフォルダ名を様式名に付けて重複を見分けられるように登録します。

---

## 実装フェーズ

| フェーズ | 内容 | 参照 | ステータス |
|---|---|---|---|
| Phase 1 | 環境構築・DB 設計・様式変換 | [phase1/](./docs/phase1/) | **完了** |
| Phase 2 | 人マスタ・案件マスタ API + UI | [phase2/](./docs/phase2/) | **完了** |
| Phase 3 | 帳票転記エンジン・テンプレート管理 | [phase3/](./docs/phase3/) | **完了** |
| Phase 4 | ダッシュボード | [phase4/](./docs/phase4/) | **完了** |
| Phase 5 | 権限・テスト・デプロイ | [phase5/](./docs/phase5/) | **実装済み（運用設定待ち）** |

## 現在の実装状況

- 認証: Supabase Auth、Google Workspace ログイン、開発環境用メールログイン
- 権限: admin / user、管理者専用画面、Server Action 側の権限チェック
- 台帳: 関係者・案件・関係者スナップショット・土地・金額の登録更新
- 帳票: Word / Excel テンプレート登録、マッピング編集、帳票生成、履歴、ダウンロード
- ダッシュボード: 案件サマリ、期限超過、未入金、月次集計
- 監査ログ: 主要な登録・更新・削除・帳票生成の履歴記録
- テスト: 転記エンジン、和暦、正規化、DOCX/XLSX 生成の単体テスト

## リリース前に確認すること

- Supabase 本番プロジェクトで migrations を適用する
- Google OAuth の許可ドメインとリダイレクト URL を本番 URL に合わせる
- Vercel に `.env.example` と同じ環境変数を登録する
- `pnpm templates:import` で本番テンプレートを登録する
- 管理者ユーザーを作成し、`public.users.role = 'admin'` に設定する

---

## 技術スタック

Next.js 15 (App Router) / React 19 / TypeScript (strict) / Tailwind CSS v4 / shadcn/ui /
Supabase (PostgreSQL + Auth + Storage) / docxtemplater + exceljs / Vercel.

詳細は [docs/phase1/01_tech_stack.md](./docs/phase1/01_tech_stack.md) を参照。
