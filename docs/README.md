# 案件管理・帳票転記システム — Claude Code 実装ガイド

## プロジェクト概要

測量業務（農地転用許可・境界確定測量・建築許可・土地改良区）に関わる案件を一元管理し、既存の Word/Excel 様式への自動転記によって帳票作成を効率化する業務システムです。

**コアコンセプト：「入力は1回だけ」**

現状の課題である「案件管理表→申請書→見積→請求→売上台帳で氏名・住所・地番を何度も重複入力する」を解消します。人マスタと案件マスタにデータを登録すれば、選択するだけで各種申請書類の下書きが自動生成されます。

## 利用者向けドキュメント

実装用ドキュメントとは別に、利用者向けの説明書ドラフトを `user-manual/` 配下に配置します。

- `user-manual/operation-manual.md`
  システム説明書のたたき台。章立てと説明の骨子を先に用意しています。
- `user-manual/screenshot-shotlist.md`
  どの画面を、どの順番で、どの権限で撮るかを整理した撮影リストです。
- `user-manual/assets/README.md`
  キャプチャ画像の保存ルールと命名規則です。

---

## ドキュメント構成

このリポジトリは Claude Code が実装手順に沿って参照できるよう、フェーズ別に分割されています。**必ず順番通りに実装してください。**

```
claude_code_docs/
├── README.md                          ← 本ファイル（全体概要・実装順序）
│
├── phase1/
│   ├── 01_tech_stack.md               ← 技術スタック・プロジェクト構成
│   ├── 02_db_schema.md                ← DBスキーマ設計（全テーブル定義）
│   └── 03_template_inventory.md       ← 様式棚卸し・変換方針・差し込み方式
│
├── phase2/
│   ├── 04_api_design.md               ← REST API / tRPC エンドポイント設計
│   ├── 05_persons_master.md           ← 人マスタ機能仕様
│   └── 06_cases_master.md             ← 案件マスタ機能仕様
│
├── phase3/
│   ├── 07_transfer_engine.md          ← 帳票転記エンジン仕様
│   ├── 08_template_management.md      ← テンプレート管理・マッピング設定仕様
│   └── 09_document_history.md         ← 帳票生成履歴・監査ログ仕様
│
├── phase4/
│   └── 10_dashboard.md                ← ダッシュボード仕様（Next.js 内製）
│
├── phase5/
│   ├── 11_auth_permissions.md         ← 認証・権限管理仕様（Supabase Auth）
│   ├── 12_testing.md                  ← テスト仕様・受入基準（Vitest + Playwright）
│   └── 13_deployment.md               ← Vercel + Supabase デプロイ・バックアップ
│
├── assets/
│   ├── field_dictionary.md            ← フィールド辞書（TransferContext全フィールド一覧）
│   └── template_list.md               ← 様式一覧・プレースホルダー設計ガイド
│
└── 様式/                              ← 様式ファイル一式（ZIP解凍後）
    ├── 土地改良区/
    ├── 境界確定測量/
    ├── 建築許可/
    └── 農地転用許可/
```

---

## 実装フェーズ一覧

| フェーズ | 内容 | 参照ドキュメント | 優先度 |
|---------|------|-----------------|--------|
| **Phase 1** | 環境構築・DB設計・様式変換 | phase1/ 全ファイル | 最高 |
| **Phase 2** | 人マスタ・案件マスタ API + UI | phase2/ 全ファイル | 最高 |
| **Phase 3** | 帳票転記エンジン・テンプレート管理 | phase3/ 全ファイル | 最高 |
| **Phase 4** | ダッシュボード（Next.js 内製、Supabase RPC 集計） | phase4/10_dashboard.md | 高 |
| **Phase 5** | 権限・テスト・デプロイ | phase5/ 全ファイル | 高 |

---

## 絶対条件（安全装置）

以下は実装の全フェーズを通じて守るべき不変ルールです。

1. **テンプレ原本は絶対に上書きしない** — 読み取り専用・版管理を徹底する
2. **出力は必ず編集可能形式** — `.docx` / `.xlsx` のみ（PDF出力は後フェーズ）
3. **転記箇所はハイライト可能** — ON/OFF 切替で「機械が触った場所」を視覚化
4. **転記前チェック必須** — 空欄・必須欠落を警告してから生成
5. **再転記は新バージョン** — 上書き禁止、履歴で追跡可能
6. **監査ログ** — 誰がいつ案件データを編集し、どの様式を生成したかを記録

---

## デモシステムからの引き継ぎ事項

デモシステム（Manus 上で稼働）の**業務ロジックと設計判断**は踏襲するが、**実装技術は本番向けに全面刷新**する（2026-04-23 決定）。

| 設計項目 | デモ | 本番（確定） |
|---|---|---|
| フレームワーク | Python + FastAPI / React + Vite + Wouter | **Next.js 15（App Router + Server Actions）** |
| DB | MySQL (Drizzle) / PostgreSQL (Docker) | **Supabase（PostgreSQL マネージド）** |
| 認証 | Manus OAuth / 独自 JWT | **Supabase Auth（Google Workspace SSO）** |
| 帳票転記 | python-docx + docxtpl + openpyxl | **docxtemplater + exceljs（Node）** |
| .doc/.xls 変換 | LibreOffice headless | **ローカル Mac で前処理**（本番では使わない） |
| Storage | S3 互換 / ローカル | **Supabase Storage** |
| ホスティング | Docker Compose + Nginx | **Vercel** |
| ダッシュボード | LarkBase 連携前提 | **Next.js 側に内製**（LarkBase 連携は破棄） |
| スナップショット | 案件関係者テーブルで実装 | 同方針を継続 |
| ファイル命名 | `{案件番号}_{様式名}_{YYYYMMDD}_v{連番}` | 同規則を継続 |

---

## 技術スタック（本番）

```
Framework:       Next.js 15（App Router + Server Actions + Route Handlers）
Language:        TypeScript（strict）
UI:              React 19 + Tailwind CSS v4 + shadcn/ui（G-DX トークン）
Form:            react-hook-form + zod
Backend / DB:    Supabase（PostgreSQL 16 + Auth + Storage）
Migrations:      Supabase CLI（supabase/migrations/*.sql）
帳票転記:         docxtemplater（+ pizzip） / exceljs
Hosting:         Vercel（hnd1 / 東京）
Testing:         Vitest + Playwright
Lint / Format:   ESLint（next/core-web-vitals）+ Prettier
```

詳細は `phase1/01_tech_stack.md`、`phase5/13_deployment.md` を参照。
