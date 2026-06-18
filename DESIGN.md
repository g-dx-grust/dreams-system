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

### 4.3 固定寸法・コントロール高（密度型の単一基準）

```
ヘッダー              h-14  (56px)  ← --height-app-header
サイドナブ            w-60  (240px) ← --width-side-nav
```

**インタラクティブ要素の高さは以下の3段に統一する**（§8.1 ボタン / §8.2 入力欄 と一致させ、
フィルタバーやフォーム末尾でボタンと入力欄の高さがズレないようにする）。

```
sm  h-7  (28px)  ← テーブル行内アクション
md  h-8  (32px)  ← 標準。Input / Select / Textarea(単一行) / 既定ボタン / フィルタバー
lg  h-10 (40px)  ← モーダルのプライマリ、主要CTA
```

- デスクトップのタッチtarget下限は **32px (h-8)**（業務密度をタッチ余白より優先）。
- モバイル（< md）では主要操作を **min-h-[44px]** に拡張する。
- 旧 §4.3 の「タッチターゲット 36px」は密度型方針により **32px (h-8) に改訂**。Input を h-9 で実装していた箇所は h-8 に揃える。

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
標準  h-8 rounded-s border border-border bg-white px-s text-m   ← 単一行は §4.3 md(h-8) に統一
focus border-main + box-shadow: var(--shadow-outline-focus)
error aria-invalid="true" のとき border-danger（focus時 ring も danger）+ 下に text-xs text-danger
disabled bg-grey-7 text-text-disabled
```

- placeholder は **入力例**のみ。ラベル代わりに使わない。色は `text-text-quaternary`（#8F959E）。
  `text-text-disabled`（#C0C4CC）はコントラスト約1.7:1で AA 未達のため placeholder に使わない
- ラベルは入力欄の上に常時表示（`text-s text-text-grey`）
- 必須表示は **ラベル末尾の小さな `*`** で。色は `text-danger`、サイズ `text-xs`
- **エラー連動（必須）**: Input / Select / Textarea は `aria-invalid` を受け取り、true のとき枠を
  `border-danger` にする。`Field` は `useId()` で id を生成し子要素へ `id` / `aria-describedby`
  （hint・error）/ `aria-invalid` を自動注入する。ラベルクリックでフォーカスが移ること
- Select の矢印 SVG は `stroke` をトークン外 HEX 直書きせず `currentColor` 相当で表現する

### 8.3 カード

```tsx
<div className="rounded-m border border-border bg-white">
  <div className="border-b border-border px-m py-m">
    <h2 className="text-l font-semibold">セクション名</h2>
  </div>
  <div className="p-m">{/* 中身 */}</div>
</div>
```

- カードのパディングは **`p-m`（16px）に統一**（§4.2 と一致）。`p-l`（24px）はモーダル等の限定箇所のみ
- カード背景は **白固定**。色をつけて目立たせない
- 影は使わない（`border` で十分）
- ヘッダーとボディの区切りは下線 1px のみ

### 8.4 テーブル（会計SaaS密度型の中核）

業務システムの中核。**情報密度と「捌く速さ」を最優先**。
反復データ（案件・関係者・土地の筆・帳票履歴・監査ログ等）は原則 **1 件 = 1 行のテーブル**で表示し、
分離カード型（行間に余白＋影）にしない（§11 参照）。

```
ヘッダー   bg-head text-s font-semibold text-text-grey   (#F5F6F7)
セル       px-m py-s text-m
行         border-b border-border
hover      hover:bg-grey-7          ← bg-column(#FAFBFC) は白とほぼ同色で不可
selected   bg-main-soft  (#F0F4FF)
数値列     text-right tabular-nums whitespace-nowrap
```

**密度型テーブルが備える標準機能（一覧の必須要件）:**

- **固定ヘッダ**: スクロール領域で `thead` を `sticky top-0 z-10`（`bg-head` 既存）。長い一覧で見出しを見失わない
- **列ソート**: ソート可能 TH はクリックで昇降トグル。`lucide-react` の `ChevronUp/Down`（未ソート時は薄い `ChevronsUpDown`）。
  サーバ側は `p_sort` / `p_order` 引数で受ける
- **一括選択**: 先頭に固定幅のチェック列（ヘッダ＝全選択／部分選択 indeterminate）。選択行は `bg-main-soft`。
  選択中は上部に「N件を選択中」＋一括アクションバーを出す
- **件数の常時表示**: テーブル上部に「全N件」を**常時**表示（totalPages>1 等で出し分けない）。0件時も「全0件」
- **行内アクション**: 行末にケバブ（`MoreVertical`）または小ボタン（sm h-7）。主要操作を1〜2個直置き＋残りはメニュー
- **既定の並び**: 一覧の目的に沿った既定ソートを置く（未入金=金額/経過日数の降順、帳票履歴=生成日時の降順 等）
- 縦罫線（`border-x`）は使わない。ボーダーは行の下 1px のみ
- 数値・金額・日数・日付・連番は **tabular-nums** で桁を揃え、`font-mono` の個別指定はしない

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

#### AppHeader（白ベース・**常設する**）

**方針確定（2026-06）**: AppHeader は**採用**し、`(dashboard)/layout.tsx` で常設する
（コンテンツ領域＝サイドナブの右側の最上部に固定）。デッドコード化していた実装を復活させる。

```
背景      bg-white border-b border-border
高さ      h-14 (56px) ← --height-app-header
左        モバイル時ハンバーガー → パンくず（§13.1）＋ 現在ページタイトル
右        ページアクションスロット（任意）＋ ユーザー名 ＋ ログアウト(Secondary sm)
```

- **現在地・ユーザー情報の正は AppHeader**。サイドナブを畳んでも常に見えるようにする
  （サイドナブ下部のユーザーブロックは重複のため撤去または最小化）
- ロゴはサイドナブ上部に置く。AppHeader にはロゴを重複させない
- 濃紺ヘッダーは廃止。ヘッダーが「画面で一番強い要素」にならないよう、白＋下境界線のみ
- ページタイトル・主要アクションは AppHeader / PageHeader のスロットに集約し、各画面でバラバラに描かない

#### サイドナブ

```
背景        bg-white border-r border-border
幅          240px (--width-side-nav)
ロゴ         上部に wordmark（チャコールの mark＋"dreaMs"＋小さなサブタイトル）
グループラベル text-xs font-medium text-text-quaternary（短い日本語。uppercase/tracking は使わない）
リンク非活性   font-medium text-text-black hover:bg-grey-7
リンク活性     bg-main-soft font-semibold text-main ＋ 左 3px の bg-main バー
アイコン       h-[18px] w-[18px] lucide-react（活性時 strokeWidth 2.25）
```

活性インジケータは **左 3px の `bg-main` バー ＋ `bg-main-soft` の淡い面**（洗練ホワイト案で採用）。
左バーは `rounded-r-full`、項目は `relative`／`min-h-10`。装飾過多にならない範囲でこの2点併用を可とする。

**レスポンシブ・状態保持（密度型で追加）:**

- **`lg` 以上**: 固定表示。展開(240px)/折りたたみ(72px アイコンのみ)をトグルできる
- **`lg` 未満**: 画面外に退避し、AppHeader 左の**ハンバーガー**で**オーバーレイドロワー**として開閉
  （`scrim` + `shadow-m`、`Esc`・スクリム押下で閉じる）。本文を常時 240px 奪わない
- **折りたたみ状態は cookie に永続化**し、初期描画から復元する（SSR と初期値の不一致による
  hydration mismatch を避けるため、サーバ側で初期幅を確定させる）
- **活性判定はセグメント境界一致**: `pathname === href || pathname.startsWith(href + "/")`。
  単純な前方一致（`startsWith(href)`）は兄弟ルートで誤活性するため使わない
- 折りたたみ時のラベル補助は `title` 属性に頼らず、`shadow-s` の Tooltip で hover/focus 即時表示
- アイコンは縮小（折りたたみ）時も判別できる、意味の明確に異なるものを選ぶ
- `<aside>` / `<nav>` に `aria-label` を付与し landmark を区別する

### 8.7 パンくず（Breadcrumb）

深い階層（案件 → 関係者 → 土地 → 帳票）で現在地と戻り導線を示す。AppHeader 左に置く。

```
区切り    lucide-react ChevronRight（h-4 w-4 text-text-quaternary）
各階層    text-s。リンクは text-text-grey（hover で text-text-black）、現在地は text-text-black
最大段数  4 段まで。超える場合は先頭ホームの次を「…」に省略
ホーム    先頭は Home アイコン or「ダッシュボード」
```

- 末尾（現在地）はリンクにしない。`aria-current="page"`
- パンくずはシェル（AppHeader）が一元提供し、各ページはタイトル/階層データを渡すだけ

### 8.8 フィルタバー（常設・即時・チップ）

一覧の絞り込みは「絞り込む」ボタン送信の全リロードにしない。**選択即時反映**を基本とする。

```
配置     テーブル直上に常設。左にキーワード/Select 群、右に件数「全N件」
即時反映  Select・チェックは onChange で即適用（URL query を更新）。キーワードは
         デバウンス（約300ms）後に適用
件数      常時「全N件」を表示（絞り込み結果が即わかる）
```

- **適用中フィルタのチップ**: 適用された条件を行下にチップで可視化（`bg-grey-7 text-text-grey`、
  各チップに×で個別解除）。複数あるときは「すべて解除」を併置
- フィルタが空のときはチップ行を出さない

### 8.9 確認モーダル（ConfirmDialog）

**破壊的・確定的操作（削除・無効化・権限変更・再同期）は必ずアプリ内モーダルで確認**する。
`window.confirm` はブランド分断・スタイル不能のため使わない。

```
構造    scrim(--color-scrim) + 中央ダイアログ（rounded-l border shadow-m bg-white、最大 480px）
本文    「何が起きるか」＋**対象を明示**（例: ユーザー『山田 太郎』を無効化します）
ボタン   右下に [キャンセル(Secondary)] [実行(Danger or Primary)]。実行は loading 対応
```

- 取り返しのつかない操作は実行ボタンを Danger に
- 確認モーダルは破壊操作に限定し、通常保存に多用しない（ステップ増を避ける）
- フォーカストラップ・`Esc` で閉じる・開いたら実行ボタンにフォーカス

### 8.10 固定保存バー（StickySaveBar）

項目数の多いフォーム（案件・関係者・金額・マッピング）は、長スクロールで保存導線を見失わないよう
**下部に固定の保存バー**を置く。

```
配置    フォーム下端に sticky bottom-0。bg-white border-t border-border、上に薄い shadow（任意）
中身    左に補助情報（未保存の変更あり 等）、右に [キャンセル(Secondary)] [保存する(Primary, loading対応)]
```

- 1 フォーム 1 プライマリ（§8.1）。保存バー内のプライマリは 1 つ
- モバイルでは `env(safe-area-inset-bottom)` を考慮

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

**発火条件（出す／出さない）:**

- 出す: サーバ保存・削除・帳票生成・招待など**非同期の確定/失敗**（「保存しました」「生成しました」）
- 出す: 画面遷移を伴わない更新で、結果が画面上すぐ見えないとき
- 出さない: 入力バリデーションエラー（→ 該当フィールド下の赤文字。§9.2）
- 出さない: 遷移先の画面自体が結果を示す場合（二重告知を避ける）
- トーストは「静かな確定感」の最後の一押し。多発させない（§11）
- 実装は ToastProvider（context）＋ `useToast()` を基盤に置き、各操作から呼ぶ

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
| 2026-06-02 | 会計SaaS密度型リファイン。全画面監査（137件）を受け、コントロール高を h-8 に統一(§4.3)、入力のエラー/aria-invalid連動(§8.2)、カードを p-m に統一(§8.3)、密度型テーブルの必須機能=固定ヘッダ/列ソート/一括選択/件数常時/行内アクション(§8.4)、AppHeader を常設に確定しパンくず・ユーザーをヘッダ集約(§8.6)、サイドナブのレスポンシブdrawer・cookie永続化・セグメント境界活性(§8.6)、パンくず(§8.7)/フィルタチップ(§8.8)/確認モーダル(§8.9)/固定保存バー(§8.10)を新設、トースト発火条件(§9.5)を明文化。計画の単一ソースは `docs/uiux-redesign-plan.md` |
| 2026-05-03 | Lark-inspired refresh。Primary を `#3370FF`、ヘッダを白ベース、weight を 400/500 に統一。dreaMs 限定の例外として宣言 |
| (それ以前) | 初版（GRUST_BLUE / GRUST_NAVY 準拠） |
