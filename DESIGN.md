# dreaMs デザインルール（Lark-inspired Refresh）

## 0. 位置づけと例外宣言

このドキュメントは **dreaMs 専用** のデザインルールです。
グラスト共通ルール（`../ClaudeCodeルール/CLAUDE.md` / `G-DX_Design_System.md`）に対して、
本ドキュメントは以下の点を **dreaMs 限定の例外として上書き** しています。

| 項目 | 共通ルール | dreaMs（本書） | 理由 |
|---|---|---|---|
| Primary 色 | `GRUST_BLUE #1a73e8` | `#3370FF`（Lark Blue） | 何も主張しない洗練された青に統一するため |
| Header 背景 | `GRUST_NAVY #0a1628`（濃紺） | 白 + 下境界線 1px | 画面の重心をコンテンツに移すため |
| アクセント色 | `GRUST_ACCENT #00c4cc` | 不採用（青のみ） | 一画面の色数を減らし、ノイズを抑えるため |
| 角丸 | 4 / 6 / 8px | 4 / 6px のみ | 業務UI で 8px は冗長と判断 |
| Font weight | 500 / 600 / 700 を使用 | **400 / 500 / 600 / 700** | 日本語UIの可読性を優先し、ナビ・見出しは 600/700 まで使用 |
| Base font size | 14px | **15px** | Noto Sans JP の日本語可読性を優先（13px本文を撤廃） |

共通ルールの他項目（デザイントークン外の色を書かない、絵文字禁止、テーブル中心、
WCAG 2.1 AA、ライティング規約 等）は **そのまま継承** します。

---

## 1. 基本哲学

> **何も主張しない。**
>
> 業務システムに必要なのは、自己主張するUIではなく **黙って正しく仕事を進めるUI** です。
> ユーザーがUIを意識せずにデータと業務に集中できる状態を最終ゴールとします。

3つの原則:

1. **引き算で作る**：色・太さ・影・角丸を「足したくなったら、まず一段下げる」
2. **境界線でレイアウトを作る**：影で領域を区切らず、1px の境界線で区切る
3. **動作で安心させる**：色や装飾ではなく、押した瞬間の反応・進捗の可視化で品質を伝える

---

## 2. カラー（Lark系）

### 2.1 トークン

実体は [src/styles/globals.css](src/styles/globals.css) の `@theme` 内 CSS 変数を参照。
Tailwind クラスとして直接使えます（例: `bg-main`, `text-text-grey`, `border-border`）。

| 役割 | 変数 | 値 | 用途 |
|---|---|---|---|
| Primary | `--color-main` | `#3370FF` | ボタン、リンク、活性タブ、フォーカスリング |
| Primary hover | `--color-main-hover` | `#4E83FF` | ボタンの hover |
| Primary darken | `--color-main-darken` | `#245BDB` | ボタンの active / 押下中 |
| Primary soft | `--color-main-soft` | `#F0F4FF` | 選択行、アクティブな nav の背景 |
| Background | `--color-background` | `#F5F6F7` | ページ背景 |
| Surface | `--color-surface` | `#FFFFFF` | カード、モーダル、入力欄 |
| Border | `--color-border` | `#DEE0E3` | カード境界、テーブル行、入力枠 |
| Border strong | `--color-border-strong` | `#C5C8CE` | hover/focus 時の境界 |
| Text 強 | `--color-text-black` | `#1F2329` | 本文、見出し |
| Text 中 | `--color-text-grey` | `#646A73` | 補足テキスト、ラベル |
| Text 弱 | `--color-text-quaternary` | `#8F959E` | プレースホルダ、無効化 |
| Danger | `--color-danger` | `#F54A45` | 削除、エラー |
| Success | `--color-success` | `#34C724` | 完了ステータス |
| Warning | `--color-warning` | `#FF8800` | 注意ステータス |

各 semantic 色には soft 版（`*-soft`）を用意。バッジ・選択行・通知の背景に使う。

### 2.2 配色ルール

- **画面の 95% は 白 / Background / Border / 黒 / グレー** で構成する
- Primary 青を使うのは **以下に限定**：
  - 1ページに1つのプライマリボタン
  - リンクテキスト
  - フォーカスリング
  - アクティブ状態（タブ、サイドナブの選択行）
  - チャートの第一系列
- 1画面のアクセントは Primary 青のみ。Success/Warning/Danger は **ステータス表現のときだけ** 使う
- 装飾目的の色は **絶対に置かない**（背景に色をつけて目立たせる、見出しを青くする等）
- グラデーション禁止（ログイン画面等の特殊演出も今回は不採用）

---

## 3. タイポグラフィ

### 3.1 フォント

```
font-family: "Noto Sans JP", "Inter", system-ui, sans-serif
```

日本語UIなので **Noto Sans JP を第一優先** で読み込む。`next/font/google` で
`weight: [400, 500, 600, 700]` をプリロードし、CSS変数 `--font-noto-sans-jp` を
`globals.css` の `--font-sans` に注入する。英数字も Noto Sans JP の混植で問題ない。

### 3.2 サイズと weight

ベースサイズは **15px**（base 1rem = 15px）。日本語の可読性を優先し、本文 13px は撤廃。

| 用途 | サイズ | weight | 例 |
|---|---|---|---|
| ページタイトル | `text-xl` (22px) | `font-semibold` (600) | 「案件一覧」 |
| セクション見出し | `text-l` (17px) | `font-semibold` (600) | カード内見出し |
| ナビ項目 | `text-m` (15px) | `font-semibold` (600) | サイドナビのリンク |
| 本文 | `text-m` (15px) | `font-normal` (400) | 標準テキスト |
| テーブル本文 | `text-m` (15px) | `font-normal` (400) | 一覧行 |
| テーブル見出し | `text-s` (14px) | `font-semibold` (600) | TH |
| 補足・ラベル | `text-s` (14px) | `font-medium` (500) | フォームラベル、メタ情報 |
| セクションラベル | `text-xs` (12px) | `font-semibold` (600) + `uppercase` `tracking-wider` | サイドナビ「業務メニュー」等 |
| KPI 数値 | `text-xxl` (30px) | `font-semibold` (600) | ダッシュボードの大きな数字 |
| キャプション | `text-xs` (12px) | `font-normal` (400) | テーブル下注釈、タイムスタンプ |

### 3.3 weight ルール

- 本文は `font-normal` (400)。情報の見つけやすさは weight ではなく **サイズ階層と余白**で作る
- 見出し・ナビ・テーブル見出しは `font-semibold` (600) を基本とする
- `font-bold` (700) は **数値の強調（合計欄、強い警告ラベル）など、狙いがある箇所のみ** に限定
- italic、underline（リンク以外）は使わない

---

## 4. 余白とレイアウト

### 4.1 グリッド

8px グリッド。スペーシング変数（`--spacing-*`）を使う。

```
--spacing-xs: 4px   ← アイコン+ラベル間
--spacing-s:  8px   ← インライン要素
--spacing-m: 16px   ← フォーム項目間、カード内
--spacing-l: 24px   ← セクション間、カードのパディング
--spacing-xl: 32px  ← ページ上下の余白
--spacing-xxl: 40px ← 主セクション間
```

Tailwind では `gap-m`, `p-l`, `space-y-l` のように使う。

### 4.2 ページ構造

```
ページ外周パディング p-m       (16px) ← 24px は冗長
セクション間        space-y-m (16px)
カードパディング     p-m       (16px) ← 横方向もp-m。p-l(24px)はモーダル等限定
フォーム間          gap-m     (16px)
インライン          gap-s     (8px)
```

最大幅 `--width-content-max` (1200px) を中央寄せ。情報密度を保つため、
**ダッシュボード本体の外周パディングは 16px**（p-m）で固定する。

### 4.3 固定寸法

```
ヘッダー         h-14   (56px) ← --height-app-header
サイドナブ       w-60   (240px) ← --width-side-nav
タッチターゲット  min-h-[36px] （業務UI ではタッチより密度を優先）
スマホタッチ     min-h-[44px] （モバイル時のみ）
```

---

## 5. 角丸

```
カード、モーダル、Drawer  rounded-m  (6px)
ボタン、入力欄、バッジ     rounded-s  (4px)
アバター、ピル形バッジ     rounded-full
```

- `rounded-l` (8px) はモーダル外枠など限定箇所のみ
- `rounded-xl` 以上は **使用禁止**

---

## 6. 影

業務UI では原則 **影を使わない**。境界線で領域を区切る。

| 用途 | 値 | 備考 |
|---|---|---|
| 通常カード | なし（`border` のみ） | これが既定 |
| ドロップダウン、ポップオーバー | `shadow-s` | 浮いていることを示す最小限 |
| モーダル、Drawer | `shadow-m` | scrim 併用 |
| トースト | `shadow-m` | 控えめ |

`shadow-l` 以上は使わない。

---

## 7. ボーダー

```
カード境界    border border-border           (1px / #DEE0E3)
テーブル行    divide-y divide-border          (薄い水平線)
入力欄        border border-border            （focus時に border-main へ）
セクション区切り border-b border-border
hover強調     hover:border-border-strong
```

枠線は **常に 1px**。2px 以上は使わない（focus ring 除く）。

---

## 8. コンポーネント

### 8.1 ボタン

種類は **Primary / Secondary / Danger / Text の 4 つだけ**。実装は [src/components/ui/button.tsx](src/components/ui/button.tsx)。

```
Primary    bg-main text-white       hover:bg-main-hover   active:bg-main-darken
Secondary  border bg-white text-text-black  hover:bg-grey-7
Danger     bg-danger text-white     hover:opacity-90
Text       bg-transparent text-main hover:underline
```

サイズ:

```
sm: h-7  px-s   text-s     ← テーブル内の操作
md: h-8  px-m   text-m     ← 標準（フォーム末尾、ヘッダ）
lg: h-10 px-l   text-m     ← モーダルのプライマリ
```

#### loading 中の挙動（必須）

- `loading` プロパティが true の間は **`disabled` + 左にスピナー** を表示
- ラベルは「保存する → 保存中…」のように **動詞の進行形**に変える
- スピナー表示は **最低 200ms** 維持する（瞬時に消えるとフィードバックが伝わらない）
- スピナーは `<span class="ui-spinner" />` を使う（globals.css 参照）

例:

```tsx
<Button loading={isPending}>{isPending ? "保存中…" : "保存する"}</Button>
```

#### Primary の数

1 ページ・1 モーダルにつき **Primary は最大 1 つ**。
「保存」「次へ」など主動線が複数あるときは、最重要のみ Primary、他は Secondary。

### 8.2 入力欄

```
標準  h-8 rounded-s border border-border bg-white px-s text-m
focus border-main + box-shadow: var(--shadow-outline-focus)
error border-danger + 下に text-xs text-danger でメッセージ
disabled bg-grey-7 text-text-disabled
```

- placeholder は **入力例**のみ。ラベル代わりに使わない
- ラベルは入力欄の上に常時表示（`text-s text-text-grey`）
- 必須表示は **ラベル末尾の小さな `*`** で。色は `text-danger`、サイズ `text-xs`

### 8.3 カード

```tsx
<div className="rounded-m border border-border bg-white">
  <div className="border-b border-border px-l py-m">
    <h2 className="text-m font-medium">セクション名</h2>
  </div>
  <div className="p-l">{/* 中身 */}</div>
</div>
```

- カード背景は **白固定**。色をつけて目立たせない
- 影は使わない（`border` で十分）
- ヘッダーとボディの区切りは下線 1px のみ

### 8.4 テーブル

業務システムの中核。情報密度を最優先。

```
ヘッダー   bg-head text-xs font-medium text-text-grey   (#F5F6F7)
セル       px-m py-s text-m
行         border-b border-border
hover      hover:bg-grey-7
selected   bg-main-soft  (#F0F4FF)
数値列     text-right tabular-nums
```

- ヘッダ行は背景グレー、ボーダーは下に 1px のみ
- 縦罫線（`border-x`）は使わない
- ソート可能列はヘッダにキャレット（`lucide-react` の `ChevronUp/Down`）
- 行数値は **tabular-nums** で桁を揃える

### 8.5 バッジ・ステータス

```
Default     bg-grey-7 text-text-grey
Primary     bg-main-soft text-main
Success     bg-success-soft text-success
Warning     bg-warning-soft text-warning
Danger      bg-danger-soft text-danger
```

- バッジは **ステータス表示専用**。装飾には使わない
- サイズ: `h-5 px-xs text-xs rounded-s`
- アイコン併用時は左に `h-3 w-3`

### 8.6 ナビゲーション

#### AppHeader（白ベース）

```
背景      bg-white border-b border-border
高さ      h-14 (56px)
ロゴ      左寄せ。文字は text-m font-medium text-text-black
ユーザー   右寄せ。ログアウトは Secondary ボタン (sm)
```

濃紺ヘッダーは廃止。ヘッダーが「画面で一番強い要素」にならないようにする。

#### サイドナブ

```
背景        bg-white border-r border-border
幅          240px (--width-side-nav)
グループラベル text-xs text-text-quaternary uppercase tracking-wider
リンク非活性   text-text-black hover:bg-grey-7
リンク活性     bg-main-soft text-main  ← 唯一の青
アイコン       h-4 w-4 lucide-react
```

活性インジケータは **左 2px の `bg-main` バー** または `bg-main-soft` の塗り、どちらか統一。
両方併用しない。

---

## 9. UX（操作の確定感）

「主張しない見た目」と引き換えに、**操作のフィードバックは強く** する。

### 9.1 ボタンクリック

| 状態 | 挙動 |
|---|---|
| 押下直後 | 即座に `disabled` + スピナー表示。最低 200ms |
| 通信中 | ラベルを進行形に変更（保存する → 保存中…） |
| 完了 | スピナー解除。トーストで「保存しました」を 2-3 秒 |
| 失敗 | スピナー解除。エラー文をボタン下またはトーストに表示 |

### 9.2 フォーム送信

- 楽観的UIを優先（保存後すぐ画面に反映、裏で通信）
- 失敗時は元の値に巻き戻し、エラートーストを表示
- バリデーションエラーは **送信前** に該当フィールド下に赤文字で表示。トーストでは出さない

### 9.3 ページ遷移

- 100ms 以上かかる遷移には **トップに高さ 2px の進捗バー**（`bg-main`）を表示
- App Router の `loading.tsx` では Skeleton を返す（spinner より静か）

### 9.4 ローディング表現の優先順位

1. **Skeleton**（コンテンツの輪郭がある場合の第一選択。`bg-grey-7` のブロックを `animate-pulse`）
2. **インラインスピナー**（ボタン内、テーブル行内）
3. **プログレスバー**（ページ上部、長時間処理）
4. **フルスクリーンローダーは使わない**（画面全体を奪わない）

### 9.5 トースト

```
位置   右下 fixed
幅     最大 360px
背景   bg-white
枠     border border-border + shadow-m
持続   成功 2.5s / エラー 5s / 警告 4s
動き   下から 8px フェードイン (200ms)、フェードアウト (150ms)
色     左に 3px の縦バーで種別を示す（main / success / warning / danger）
```

トーストは **同時に 1 つまで**。連続発火する場合は最新のものに置き換える。

### 9.6 フォーカス

- 全インタラクティブ要素にフォーカスリング `var(--shadow-outline-focus)` (透明度32%の青リング)
- マウスクリック時のリングは `:focus-visible` のみ（フォーカスの過剰表示を抑制）

### 9.7 アニメーション

- `duration-200` を基本、最大 `duration-300`
- easing: `cubic-bezier(0.4, 0, 0.2, 1)`（標準的な ease-out）
- 跳ねる・spring・3D 系は使わない
- `prefers-reduced-motion: reduce` 時は遷移を 0.01ms に縮約（既に globals.css で対応）

---

## 10. アクセシビリティ

- WCAG 2.1 AA 準拠：本文 4.5:1、大きな文字 3:1 以上のコントラスト
- すべての操作はキーボードのみで完結する
- `aria-label` / `aria-live` を要所に付与
- スマホ時のタッチターゲット最小 44px、デスクトップは 36px 許容（業務密度優先）
- iOS の `env(safe-area-inset-bottom)` を bottom-fixed 要素で考慮

---

## 11. やってはいけないこと（Anti-patterns）

| NG | なぜ |
|---|---|
| グラデーション背景 | AI感・派手さが出る |
| グロウ・発光 | 業務UI と相性が悪い |
| `font-bold` / `font-semibold` の多用 | 重要度の階層が壊れる |
| 3 色以上のアクセント | 何が大事か分からなくなる |
| 大きな角丸（8px超） | 軽薄に見える |
| カード背景に色をつける | 色が情報を運ぶ役割を失う |
| バッジを装飾で使う | ステータスとの区別が消える |
| 1ページに複数の Primary | 主動線が分散する |
| 影で領域を区切る | 業務密度に対し過剰演出 |
| 絵文字を UI に置く | 共通ルール §0 |
| アニメーションで「すごさ」を演出 | 安っぽくなる |
| トーストの多発 | 通知疲れ。原則は静かな確定感 |
| ヘッダを濃色で塗る | 重心が上に寄る |
| 必須表示を色だけで示す | 色覚多様性で読めない（テキスト＋色） |

---

## 12. 変更履歴

| 日付 | 変更内容 |
|---|---|
| 2026-05-03 | Lark-inspired refresh。Primary を `#3370FF`、ヘッダを白ベース、weight を 400/500 に統一。dreaMs 限定の例外として宣言 |
| (それ以前) | 初版（GRUST_BLUE / GRUST_NAVY 準拠） |
