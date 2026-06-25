# Phase 4: ダッシュボード仕様（Next.js 内製）

## 方針

ダッシュボードは **本システム内（Next.js）で内製** する。
旧版にあった「LarkBase 連携前提」「LarkBase Webhook」は **破棄**（2026-04-23 決定）。

- **実装**：スタッフ向けの案件数・期限系は Server Component で直接集計する。経営指標は社長アカウント（現行DBでは `admin` ロール）だけが取得・表示する。
- **UI**：業務 SaaS らしく、テーブル中心の情報密度重視（CLAUDE.md §4.4）。
- **チャート**：比較用として一時的に3パターンのタブを置き、直感で選べるようにする。多色を避け `CHART_1` 〜 `CHART_8` の範囲で描く。

---

## 画面構成

```
┌──────────────────────────────────────────────────────────┐
│ AppHeader (GRUST_NAVY)                                    │
├──────────┬───────────────────────────────────────────────┤
│ SideNav  │ ページタイトル：ダッシュボード                  │
│          │ ─────────────────────────────────────────     │
│          │ ┌─ 指標カード群（4 枚横並び） ─┐               │
│          │ │ 総案件 45  進行中 12          │               │
│          │ │ 期限超過 3  期限間近 5        │               │
│          │ └────────────────────────────────┘             │
│          │                                                │
│          │ ┌─ 期限超過・期限間近の案件（テーブル） ────┐   │
│          │ │ 案件番号 / 案件名 / 担当 / 締切 / 状態       │   │
│          │ └────────────────────────────────────────────┘   │
│          │                                                │
│          │ ┌─ 請求済み未入金（テーブル） ───────────────┐   │
│          │ │ 案件番号 / 案件名 / 請求額 / 請求日          │   │
│          │ └────────────────────────────────────────────┘   │
│          │                                                │
│          │ ┌─ 月次推移（折れ線 / 棒グラフ 1 枚） ────────┐   │
│          │ │ 新規案件数・完了数・請求額・入金額（12M）     │   │
│          │ └────────────────────────────────────────────┘   │
└──────────┴───────────────────────────────────────────────┘
```

- Base コンポーネント（白背景 + `SHADOW_S`）でそれぞれをグルーピング
- セクション間は `SPACE_L`（24px）
- 指標カードは `CHART_1`（MAIN）を主色に、期限超過のみ `DANGER`、期限間近は `WARNING_YELLOW` 系で控えめに
- Primary ボタンは置かない（閲覧専用）。各セクションから該当一覧画面へのテキストリンク（「すべて見る」）のみ

---

## 表示する指標

### 権限分離

| ロール                              | 表示する範囲                                                             |
| ----------------------------------- | ------------------------------------------------------------------------ |
| スタッフ（`user`）                  | 案件数、進行中、期限超過、期限間近、期限超過・期限間近テーブルのみ       |
| 社長アカウント（現行DBでは`admin`） | スタッフ向け指標に加え、経営指標・売上・未入金・構成比・業者別分析を表示 |

金額・請求・入金・売上・外注費は経営指標として扱い、スタッフ画面では取得も表示もしない。

### 比較用ダッシュボードタブ（一時）

社長アカウントには、ダッシュボード上部に以下3パターンの比較タブを一時的に表示する。

| パターン            | 意図                                                     |
| ------------------- | -------------------------------------------------------- |
| パターンA：現場運用 | 案件数・期限・未入金をテーブル中心で確認する             |
| パターンB：経営指標 | 受注・売上・全体売上推移・構成比をチャート中心で確認する |
| パターンC：売上台帳 | 案件別・依頼主別・エリア/区分別・外注費確認に寄せる      |

最終デザイン確定後、この比較タブは削除し、選ばれた1パターンに統合する。

### 指標カード

| 指標                 | 元データ | 集計ロジック                                                                                          |
| -------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| 総案件数             | `cases`  | `COUNT(*)`（`cancelled` を除く）                                                                      |
| 進行中               | `cases`  | `status = 'in_progress'` の件数                                                                       |
| 期限超過             | `cases`  | `deadline_date < CURRENT_DATE AND status NOT IN ('completed','cancelled')`                            |
| 期限間近（7 日以内） | `cases`  | `deadline_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND status NOT IN ('completed','cancelled')` |

### テーブル：期限超過・期限間近の案件

- 条件：上記「期限超過」＋「期限間近」の和集合
- 列：案件番号 / 案件名 / 担当者 / 締切日 / ステータス / 残日数（マイナスは赤字）
- 並び：締切日昇順
- 件数：上位 20 件（以降は「すべて見る」で案件一覧へ）

### テーブル：請求済み未入金

- 条件：`case_financials.invoice_amount IS NOT NULL AND paid_amount IS NULL`
- 列：案件番号 / 案件名 / 請求金額（税込） / 請求日（※将来カラム追加）/ 経過日数
- 並び：経過日数降順
- 件数：上位 20 件

### チャート：月次推移（過去 12 ヶ月）

- 系列：新規案件数 / 完了案件数 / 請求額（税込） / 入金額
- 型：棒グラフ（件数）＋折れ線（金額）の複合 or 2 枚分割
- 色：`CHART_1`, `CHART_2`, `CHART_3`, `CHART_8` を使用（CLAUDE.md §4.3）

### 経営指標（社長アカウント限定）

- 棒グラフ：行政書士業務／土地業務／建物業務の受注・売上
  - 現行DBでは `case_type` から分類する
  - 受注は `invoice_amount`、売上は `paid_amount` を基準にする
- 折れ線：全体売上（過去12ヶ月の `paid_amount`）
- 円グラフ：ボタン切替で取引先別／業務区分別の構成比（％）を表示する
- 業者ごとの受注月分析：取引先行をクリックすると月別の受注・売上を表示する
- 売上：案件ごと／依頼主ごと／エリア・区分をボタンで切り替える
- 外注費：現行DBに外注費入力元がないため、比較UIでは「未登録」として表示する。正式実装時は外注費テーブルと入力画面を追加してから、外注先一覧、全体・個別・月別を表示する。

---

## データ取得（Supabase RPC）

集計ロジックは DB 関数に寄せる（複数回のラウンドトリップを避ける）。

```sql
-- supabase/migrations/0002_dashboard_functions.sql

CREATE OR REPLACE FUNCTION public.dashboard_summary()
RETURNS JSONB AS $$
    SELECT jsonb_build_object(
        'total_cases',      (SELECT COUNT(*) FROM cases WHERE status <> 'cancelled'),
        'in_progress',      (SELECT COUNT(*) FROM cases WHERE status = 'in_progress'),
        'overdue',          (SELECT COUNT(*) FROM cases
                             WHERE deadline_date < CURRENT_DATE
                               AND status NOT IN ('completed','cancelled')),
        'due_soon',         (SELECT COUNT(*) FROM cases
                             WHERE deadline_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
                               AND status NOT IN ('completed','cancelled')),
        'unpaid_count',     (SELECT COUNT(*) FROM case_financials
                             WHERE invoice_amount IS NOT NULL AND paid_amount IS NULL),
        'unpaid_total',     COALESCE((SELECT SUM(invoice_amount) FROM case_financials
                                      WHERE invoice_amount IS NOT NULL AND paid_amount IS NULL), 0)
    );
$$ LANGUAGE sql STABLE SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.dashboard_overdue_cases(p_limit INT DEFAULT 20)
RETURNS TABLE (
    id                INT,
    case_number       TEXT,
    case_name         TEXT,
    assigned_user     TEXT,
    deadline_date     DATE,
    status            TEXT,
    days_remaining    INT
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
    case_id           INT,
    case_number       TEXT,
    case_name         TEXT,
    invoice_amount    BIGINT,
    tax_rate          NUMERIC,
    updated_at        TIMESTAMPTZ
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
    year_month       TEXT,
    new_cases        INT,
    completed_cases  INT,
    invoice_amount   BIGINT,
    paid_amount      BIGINT
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
```

> **`SECURITY INVOKER`** とすることで、呼び出しユーザーの RLS が適用される。集計関数から機微情報が漏れないよう、RLS に依存する設計。

---

## Server Component 実装

```tsx
// src/app/(dashboard)/page.tsx
import { createClient } from "@/lib/supabase/server";
import { DashboardCards } from "@/components/dashboard/cards";
import { OverdueTable } from "@/components/dashboard/overdue-table";
import { UnpaidTable } from "@/components/dashboard/unpaid-table";
import { MonthlyChart } from "@/components/dashboard/monthly-chart";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [summaryRes, overdueRes, unpaidRes, monthlyRes] = await Promise.all([
    supabase.rpc("dashboard_summary"),
    supabase.rpc("dashboard_overdue_cases", { p_limit: 20 }),
    supabase.rpc("dashboard_unpaid_cases", { p_limit: 20 }),
    supabase.rpc("dashboard_monthly_stats"),
  ]);

  return (
    <div className="space-y-[var(--space-l)]">
      <h1 className="text-xl font-bold text-[color:var(--color-text-black)]">ダッシュボード</h1>
      <DashboardCards data={summaryRes.data} />
      <OverdueTable rows={overdueRes.data ?? []} />
      <UnpaidTable rows={unpaidRes.data ?? []} />
      <MonthlyChart rows={monthlyRes.data ?? []} />
    </div>
  );
}
```

### チャートライブラリ

- 第一選択：軽量な純 SVG / HTML での実装（棒グラフ・折れ線だけなら自前で十分）
- 必要なら `recharts` を追加導入検討（要ユーザー承認）

---

## 簡易ステータスバー（AppHeader / SideNav）

全画面の右上または SideNav 下部に以下の簡易インジケーターを表示する。Server Component で計算しレイアウトに埋め込む。

| インジケーター | 内容                   | 色                              |
| -------------- | ---------------------- | ------------------------------- |
| 期限超過       | 締切日を過ぎた案件数   | `DANGER`                        |
| 期限間近       | 7 日以内に締切の案件数 | `WARNING_YELLOW` + `TEXT_BLACK` |
| 進行中         | `in_progress` の案件数 | `MAIN`                          |

クリックすると案件一覧にフィルタ付きで遷移（`/cases?filter=overdue` 等）。

---

## 権限

- ダッシュボードは**認証済みユーザー全員**がアクセス可能（admin / user 共通）
- 表示されるデータは呼び出しユーザーの RLS で絞られる（RPC が `SECURITY INVOKER`）
- 機微情報（金額）は現状は全員閲覧可だが、将来「user には金額を出さない」が必要になれば RLS でカラム単位制御 or View 分離で対応

---

## 将来拡張（スコープ外）

- 担当者別の稼働ヒートマップ
- 案件種別のパイプライン可視化（Kanban 風）
- CSV エクスポート
- 通知（期限 7 日前の自動リマインダー）— メール or Slack

※ LarkBase Webhook 連携は採用しない（方針変更）。
