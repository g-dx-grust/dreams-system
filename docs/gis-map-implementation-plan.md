# dreaMs 地図（GIS）機能 実装計画 / ハンドオフ仕様

> このドキュメントは **別チャット（実装担当）がそのまま着手できる**ことを目的とした、dreaMs（案件管理・帳票転記システム）への地図機能統合の実装計画です。
> 作成日: 2026-06-03 / 対象リポジトリ: `dreaMs/kanri-system`（Next.js 15 App Router + React 19 + TypeScript + Supabase(PostgreSQL) + Tailwind v4）

## 2026-06-18 改訂: 案件座標を地図表示の正本にする

クライアントレビューにより、地図の管理単位は番地・住所ではなく **案件マスタの緯度/経度（世界測地系、JGD2011/WGS84相当）** を正とする。住所・番地・筆情報は検索、帳票、補助表示として保持する。

- `cases.latitude` / `cases.longitude` を案件ピンの正本とする。
- 座標は任意項目。任意座標の現場や座標未確定の案件も登録できる。
- 地図クリックで取得した座標は案件レコードへ保存する。
- 既存の `case_parcels.geom` / `boundary` / `geo_status` は、筆代表点・筆界ポリゴンの補助表示および第2段階以降の拡張として残す。
- 横断地図は、座標が設定された案件を案件ピンとして表示する。
- 基準点・測量点のCSV/Excel取り込みは `imported_coordinate_points` に保存し、案件ピンとは別の補助レイヤーとして表示する。取り込み対象は世界測地系の緯度/経度のみで、平面直角座標系X/Yや日本測地系の自動変換はこの段階では行わない。

---

## 0. このドキュメントの使い方（実装担当へ）

着手前に必ず読むこと:
- `CLAUDE.md`（最上位ルール）／`DESIGN.md`（dreaMs デザイン仕様・密度型）
- 本書 §1（決定事項）→ §11（承認が必要な事項）を最初に確認。**新規パッケージ追加・PostGIS 有効化・本番DBへの操作はユーザー承認が前提**（CLAUDE.md §3.2 / §7.3）。
- 既存の実装パターンを踏襲する：
  - 一覧/テーブル/フィルタ：`src/components/cases/cases-table.tsx`・`cases-filter.tsx`・`src/components/common/sort-header.tsx`
  - 全画面ワークスペース：`isTemplateMappingWorkspace`（`src/components/layout/dashboard-route-utils.ts`）＋ `app-shell.tsx` の分岐（地図も同方式でフルブリード化できる）
  - サーバRPC：`SECURITY DEFINER SET search_path = public` ＋ 関数冒頭で `public.is_active_user()` 検査（例: `list_cases_safe` / `replace_case_parcels`）
  - マイグレーション：`supabase/migrations/00NN_*.sql` 連番 → `supabase db push` → `pnpm db:types`（**最新は 0021。地図関連は 0017 から**）
  - 基盤UI：`src/components/ui/*`（Card/Table/Button/Field/ConfirmDialog/SaveBar/Toast 等は実装済。流用する）

---

## 1. 目的とスコープ（決定事項）

ユーザー確定事項（2026-06-03）。ただし、2026-06-18 のクライアントレビューにより、P1 の正本は筆座標ではなく **案件マスタの緯度/経度** に変更する。以下の筆代表点・筆界ポリゴンは補助表示および第2段階以降の拡張として扱う。

| 項目 | 決定 |
|---|---|
| **目的（機能）** | ①案件マスタ座標の**地図ビュー** ②**地図クリックで案件ピンを保存** ③住所・番地・筆情報は補助表示として保持 ④CSV/Excel座標点を補助レイヤー表示 |
| **座標データの持ち方** | **`cases.latitude` / `cases.longitude` を正本**。`case_parcels.geom` / `boundary` / `geo_status` は筆代表点・筆界の補助情報 |
| **dreaMsとの連動** | **dreaMs内に統合**（同リポジトリ・同 Supabase に PostGIS を載せる） |
| 今回スコープ外（将来拡張） | 平面直角座標系・日本測地系の自動変換、国土地理院の基準点情報表示、位置図/公図PDFの自動生成（申請添付用） |

対象ドメイン: 行政書士／土地家屋調査士業務。中核エンティティは **案件** と **筆（地番）**。地図表示の代表位置は案件マスタの緯度/経度を正本とし、既存 `case_parcels`（`pref / city / oaza(大字) / aza(字) / chiban(地番) / chimoku(地目) / area(地積) / tenyo_area(転用面積)`）は住所・番地・筆単位の業務情報として保持する。

---

## 2. 全体方針

1. **段階導入**。P1 は案件マスタの緯度/経度を正本にし、地図クリックで案件ピンを保存する。筆代表点・筆界ポリゴンは補助情報として残し、データが増えてからベクタータイル配信へ移行する。
2. **P1 の座標は WGS84 / EPSG:4326 の緯度/経度のみ保存**（MapLibre・GeoJSON・地理院タイルすべてと整合）。平面直角座標系・日本測地系の自動変換は第2段階の設計事項とし、P1 では緯度/経度として自動解釈しない。
3. **「座標未確定」を一級市民として扱う**。法務省データは**公共座標系で整備済みなのは全国の約半分**で、残りは「任意座標（公図ベース、地理座標に乗らない）」。地番だけ有り座標が無い筆が大量に出る前提で `geo_status` を設け、一覧で別管理する。
4. **出典・ライセンスを画面に常時明示**。地理院タイルは出典明示が利用規約上の義務。法務省登記所備付地図データは**公的証明ではない**（地図証明書・図面証明書の代替不可）旨を画面に明記し、調査士業務の最終判断を誤認させない。
5. **デザインは G-DX 密度型**（`DESIGN.md`）。地図上のコントロールも Primary/Secondary/Danger/Text の4種に限定、過剰な角丸・影・グラデーション・絵文字を持ち込まない。出典表記は MapLibre の attribution（右下）で常時表示。

---

## 3. 技術選定

### 3.1 採用ライブラリ（**いずれも新規依存＝事前ユーザー承認が必要**）

| ライブラリ | バージョン | ライセンス | 役割 |
|---|---|---|---|
| **maplibre-gl** | `^5.24`（5.24.x安定版。v6はプレリリースのため避ける） | BSD-3-Clause | 地図エンジン本体。**APIキー不要**。地理院タイル(ラスタ/ベクタ)・GeoJSON 重畳・クリック地物選択。Mapbox GL v2系（独自課金・トークン必須）と取り違えない |
| **@watergis/maplibre-gl-terradraw** | `^1.13` | MIT | 描画＋**距離/面積の計測コントロール**（MaplibreMeasureControl）。②の計測と筆界描画MVPをまとめて満たす。peer: maplibre-gl ^4\|\|^5 |
| **terra-draw** ＋ **terra-draw-maplibre-gl-adapter** | terradraw経由 | MIT | 上記の実体（描画ライブラリ）。将来別地図への移植性も確保 |
| **@turf/turf**（または個別 `@turf/area`,`@turf/length`） | `^7` | MIT | 地積(㎡)算出・計測のカスタム表示。クライアント即時計測用 |
| **PostGIS**（Supabase拡張） | 実DBで `select postgis_full_version();` で確認（PG15系≈3.3.x、新イメージ3.4/3.5） | GPL-2.0（サーバ拡張・アプリコードに伝播しない） | 筆の点/ポリゴンを geometry 型で保持、空間index、面積/距離、`ST_AsMVT` |
| （将来）**pmtiles** ＋ tippecanoe / **Martin** | — | BSD/Apache | 数千ポリゴン超のベクタータイル配信。MVPでは不要 |

> **date 関連は date-fns を継続**（dayjs/moment 禁止）。アイコンは lucide-react のみ。

### 3.2 外部データソース（ライブラリではない・API/タイル）

| ソース | 用途 | 規約・注意 |
|---|---|---|
| **国土地理院 地理院タイル** 標準`/xyz/std/{z}/{x}/{y}.png`・淡色`/xyz/pale/...`・写真`/xyz/seamlessphoto/{z}/{x}/{y}.jpg`（最大z18）、最適化ベクトル`/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf`（z4〜16） | 背景地図 | **リアルタイム読込のWeb表示は申請不要・出典明示のみ**。出典「地理院タイル」＋[一覧ページ](https://maps.gsi.go.jp/development/ichiran.html)リンクを**常時画面表示**。PDL1.0準拠・商用可。タイル画像のDL保存/印刷物化は別途複製・使用申請が必要 |
| **国土地理院 逆ジオコーダ** `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=..&lon=..` | 地図クリック点→住所プレフィル | 無料・登録不要・CORS許可済。**町丁目レベルまで**（番地・地番は取得不可→地番は手入力フローを必ず残す） |
| **法務省 登記所備付地図データ**（G空間情報センター） | 筆界ポリゴン＋地番 | §8 で詳述。**公共座標系図郭のみ変換済GeoJSON提供、任意座標は別途**。年1回更新・過去年版併存。**公的証明ではない** |
| （補助）**デジタル庁 abr-geocoder**（TS/Node, `abrg serve start`でREST化） | 住所文字列→正規化＋代表点緯度経度 | 地番は**代表点レベル・未整備あり・筆形状は出ない**。表記ゆれ正規化の前処理に有用 |

---

## 4. データモデル設計（PostGIS）

### 4.1 方針

- PostGIS は **public を汚さない**よう `extensions`（または `gis`）スキーマに入れる（Supabase 推奨）。型参照は `extensions.geometry(...)` で修飾。
- 保存は **`geometry(..., 4326)`**（geography ではなく geometry）。理由：`ST_Buffer/ST_Union/ST_Intersection/ST_Simplify` 等の**編集系関数は geography 非対応**で、筆界の幾何編集を見込むなら geometry が無難。**面積/距離は計測時に `::geography` キャスト**（または平面直角座標系へ `ST_Transform`）して ㎡/m を得る（4326のまま `ST_Area` すると単位が「度」で無意味）。
- 空間インデックスは **GIST 必須**。
- `case_parcels` に座標を**追加**（別テーブルにしない）。1筆=1行の既存構造を維持。

### 4.2 マイグレーション設計（`0017_postgis_case_parcels_geo.sql` イメージ）

```sql
-- PostGIS 有効化（専用スキーマ。public を汚さない）
create extension if not exists postgis with schema extensions;

-- 筆に座標/筆界/座標ステータスを追加（すべて NULL 許容＝任意座標・未測量筆も登録可）
alter table public.case_parcels
  add column if not exists geom     extensions.geometry(Point,   4326),  -- 手動ピン代表点
  add column if not exists boundary extensions.geometry(Polygon, 4326),  -- 筆界ポリゴン（将来）
  add column if not exists geo_status text not null default 'unset'
    check (geo_status in ('unset','pinned','boundary','arbitrary'));
--   unset=未設定 / pinned=手動ピン / boundary=筆界ポリゴンあり / arbitrary=任意座標(地図に乗らない)

create index if not exists idx_case_parcels_geom     on public.case_parcels using gist (geom);
create index if not exists idx_case_parcels_boundary on public.case_parcels using gist (boundary);
```

> **重要**: `supabase gen types` は geometry 型を素直に出さないことがある。Server Action 側は **WKT/GeoJSON 文字列と相互変換**（`ST_AsGeoJSON` / `ST_GeomFromGeoJSON` / `ST_SetSRID(ST_MakePoint(lng,lat),4326)`）を介す設計にし、TS では geometry を直接触らない。

### 4.3 将来：筆界マスタ（法務省データ取込時）

全面取込時は案件に紐づかない**全国筆界マスタ**を別テーブルに持つ（案件の `case_parcels.boundary` はそこからコピー or 参照）。版管理・監査を最初から設計（CLAUDE.md「履歴保持・監査ログ必須」）。

```sql
-- 例（フェーズ2で詳細化）
create table public.cadastral_parcels (
  id            bigint generated always as identity primary key,
  data_year     int  not null,          -- 法務省データの年版（例 2026）
  city_code     text not null,          -- 市区町村コード(5桁)
  oaza_name     text, chome_name text, chiban_name text,
  coord_kind    text,                   -- 公共座標系/任意座標系
  geom          extensions.geometry(Polygon,4326),
  src_object_id text,                   -- 元データの面id
  imported_at   timestamptz not null default now()
);
create index idx_cadastral_geom on public.cadastral_parcels using gist (geom);
create index idx_cadastral_key  on public.cadastral_parcels (city_code, oaza_name, chiban_name);
```

---

## 5. アーキテクチャ（Next.js 15 統合）

```
[ブラウザ]
  MapView.tsx ('use client')  ── new maplibregl.Map()  背景=地理院タイル
    │  GeoJSON source（案件の筆。MVPは直渡し）
    │  クリック→queryRenderedFeatures→筆ID／lngLat
    │  計測=terradraw + turf（即時表示のみ。保存値はサーバ正）
    ▼ 書き込み（Server Action）          ▲ タイル配信（Route Handler, 将来）
[Next.js Server]
  Server Component: 初期GeoJSON取得（supabase.rpc）
  Server Action:    筆へ座標保存（supabase.rpc, ST_SetSRID(ST_MakePoint...)）
  Route Handler:    app/api/tiles/parcels/[z]/[x]/[y]/route.ts（ST_AsMVT, GET + Cache-Control）※フェーズ4+
[Supabase / PostGIS]
  case_parcels(geom, boundary)  / spatial RPC（SECURITY DEFINER + is_active_user()）
```

要点（研究で確定した定石）:
- **地図は必ず `'use client'` ＋ 親から `dynamic(() => import('@/components/map/MapView'), { ssr: false })`**。SSRで window 参照落ちを防ぐ。`import 'maplibre-gl/dist/maplibre-gl.css'` 必須。
- **React 19 / StrictMode 二重マウント対策**：`useEffect` のクリーンアップで必ず `map.remove()`（WebGLコンテキストリーク防止）。
- 通常の空間クエリ・面積取得は **Server Component / Server Action** で `supabase.rpc(...)`。**MVTタイル配信は Server Action ではなく GET の Route Handler（or Edge Function）**にして `Cache-Control` を効かせる（高頻度・キャッシュ前提）。
- 空間RPCは `SECURITY DEFINER` で RLS をバイパスするため、**関数冒頭で `is_active_user()` を必ず検査**（既存パターン踏襲。CLAUDE.md「RLS＋アプリ層二重防衛」）。

### 5.1 想定ファイル構成

```
src/components/map/
  map-view.tsx            # 'use client' MapView（地図初期化・背景切替・出典）
  parcel-layers.ts        # GeoJSON source/レイヤー定義（fill/line/point）
  measure-control.ts      # terradraw 計測コントロールの薄いラッパ
  use-reverse-geocode.ts  # GSI逆ジオコーダ（クリック→住所、デバウンス）
src/app/(dashboard)/cases/[id]/map/page.tsx   # 案件詳細「地図」タブ（全画面ワークスペース）
src/app/(dashboard)/map/page.tsx              # 案件横断の地図ビュー（任意・フェーズ後半）
src/app/api/tiles/parcels/[z]/[x]/[y]/route.ts# ベクタータイル配信（フェーズ4+）
src/server/geo.ts         # "use server" 空間アクション（座標保存・GeoJSON取得・面積計測）
supabase/migrations/0017_postgis_case_parcels_geo.sql ほか
```

---

## 6. 機能仕様

### A. 案件・筆の地図ビュー
- 案件詳細に **「地図」タブ**を追加（`cases/[id]/layout.tsx` の `TabNav` に1項目追加）。`isTemplateMappingWorkspace` と同様の**全画面ワークスペース**化を検討（地図は縦に広く使いたい）。
- 背景は **地理院 淡色地図（pale）を既定**、標準(std)・写真(seamlessphoto)を切替。各 source に `attribution` を設定し**右下に出典常時表示**。
- 当該案件の `cases.latitude` / `cases.longitude` が揃っている場合は、案件ピンとして GeoJSON で重畳。座標未設定の案件は地図クリックで代表位置を保存できる。
- 筆（`case_parcels.geom` / `boundary` がある行）は補助表示。`geo_status='arbitrary'`/`'unset'` の筆は地図に出ず、**「筆代表点未設定 N件」**として一覧側に表示する。
- 案件ピンのクリックは案件詳細へ遷移。筆補助ピンのクリックは地番・大字・字・地積の確認に使う。

### B. 筆界ポリゴン表示＋簡易計測
- 第2段階以降。`boundary`（Polygon）を fill＋line で表示。`@watergis/maplibre-gl-terradraw` の **MaplibreMeasureControl** で距離(m)・面積(㎡)を即時計測（右上に最小コントロール）。
- **計測の保存値・帳票値はサーバ（PostGIS）を正**とする：`ST_Area(boundary::geography)`＝㎡、`ST_Length(line::geography)`＝m。クライアント計測は「地図上ドラッグの即時表示」に限定。
- 地積（㎡）の桁・丸めは業務要件（登記地積）に合わせる。

### C. 地図クリックで案件ピンを登録（手動ピンMVP）
- 地図クリック→`lngLat` 取得→**GSI逆ジオコーダ**で付近住所を補助表示→`cases.latitude` / `cases.longitude` に保存する。**番地・地番は既存の土地情報として保持**し、地図表示の正本にはしない。
- 任意座標の現場は、測量側の任意座標を世界測地系へ強制変換せず、地図上で代表位置を手動クリックして案件ピンを設定する。
- 書き込みは `src/server/geo.ts` の Server Action 経由。DB更新は `set_case_coordinates` / `clear_case_coordinates` RPC に集約する。

### D. CSV/Excel座標点取り込み
- 緯度/経度（世界測地系）列を持つCSV/Excelを `imported_coordinate_points` に取り込み、全体地図で案件ピンとは別の補助レイヤーとして表示する。
- 平面直角座標系の `X/Y`、日本測地系の旧座標はP1では取り込まない。誤表示を避けるため、緯度/経度ヘッダーが明示された列だけを対象にする。

UI（DESIGN.md準拠）: 地図コントロールは最小限、配色は MAIN/GRUST_NAVY＋グレー、角丸4/6/8px、影は控えめ。保存は SaveBar / 成功は Toast / 破壊操作（筆削除）は ConfirmDialog（実装済プリミティブを流用）。

---

## 7. 段階実装プラン

| フェーズ | 内容 | 主な成果物 | 受け入れ基準 |
|---|---|---|---|
| **P0 基盤** | パッケージ承認取得→追加、PostGIS有効化(0017)、`case_parcels` に geom/boundary/geo_status、`postgis_full_version()` 確認、`pnpm db:types` | migration 0017、依存追加、型再生成 | type-check/lint/build green、`select postgis_full_version()` 記録 |
| **P1 案件座標ビュー＋手動ピン** | MapView（'use client'+dynamic ssr:false）、地理院タイル背景＋出典、`cases.latitude/longitude` を案件ピンとして表示、クリックで案件ピン保存、座標検索、CSV/Excel座標点補助レイヤー | migration 0020/0021、`map-view.tsx`/`map-overview.tsx`/`geo.ts`/案件「地図」タブ | 座標付き案件を地図に表示・地図クリック保存・再読込で保持・ピンから案件詳細へ遷移・座標検索・CSV/Excel座標点表示・出典常時表示 |
| **P2 筆界ポリゴン取込（限定）** | G空間情報センターの**変換済GeoJSON（公共座標系図郭のみ）**を対象市区町村だけ取得→`ST_MakeValid`修復→`cadastral_parcels` 投入→案件の筆へ地番突合で `boundary` 反映。版管理・監査ログ | ETLスクリプト（別バッチ）、migration、突合RPC | 対象市の筆界が表示・地番突合の正誤を目視確認・任意座標は除外と明記 |
| **P3 計測** | terradraw 計測UI＋サーバ正値（ST_Area/ST_Length on geography）、地積との突合表示 | 計測コントロール、面積RPC | 面積㎡/距離m がサーバ計算で一致・桁/丸め要件充足 |
| **P4 スケール（必要時）** | 筆数が数千超でベクタータイル化：`ST_AsMVT` RPC ＋ Route Handler（Cache-Control）or PMTiles配信、さらに高負荷なら Martin 別ホスト | `app/api/tiles/.../route.ts` | 市区町村規模を滑らかに表示・タイルキャッシュ確認 |
| **将来** | 位置図/公図PDFの申請添付出力（§10）、登記所備付地図の差分更新運用 | — | — |

> 各フェーズ末で type-check / lint / build / 既存テストを green に保つ。スキーマ変更は migration 経由のみ・本番破壊操作禁止。

---

## 8. 法務省「登記所備付地図データ」取り込み（P2 詳細）

### 8.1 事実（研究で確認）
- 入手：**G空間情報センター**（front.geospatial.jp / geospatial.jp/ckan）で無償公開。無料登録＋規約同意でDL。**年1回更新**、過去年版（2023〜）併存（例 `01101-4300-2026.zip`）。
- フォーマット2系統：(1) 原本＝**地図XML（MOJ XML）**、(2) G空間情報センターが機械変換した **Shapefile / GeoJSON**。**変換済は「公共座標系が付与された図郭のみ」**（任意座標の筆は含まれない）。変換済GeoJSONは GDAL/ogr2ogr で経緯度（4326）出力済＝背景地図にそのまま重畳可。
- 座標系：公共座標系＝**平面直角座標系1〜19系（JGD2000/2011、EPSG:6669〜6687）**。系番号・測地系はファイル名で判別不可、**XMLヘッダーで確認**。原本XMLを自前処理する場合は系番号→EPSG対応＋`ST_Transform(...,4326)` が必須。
- データ構造：ファイル＞図郭＞筆。筆属性に**大字/丁目/地番コード・名称＋座標値種別（精度）＋面id**を持ち、面idでポリゴンと紐付く（**地番と筆界が同一データ内で対応**）。
- **任意座標問題**：地籍調査未実施（公図ベース）の筆は地理座標に乗らず、**公共座標系で整備済みなのは全国の約52%**（残り約半分は任意座標）。地番だけ有り座標が無い筆が大量に出る前提で設計。
- ライセンス：誰でも無償利用可・不正目的禁止・**公的証明ではない**（地図/図面証明書の代替不可）。出典/商用/再配布の明示条文は弱く、**DLパッケージ同梱の利用規約原文を運用前に法務確認**推奨。デジタル庁コンバータ成果物はMIT。

### 8.2 変換ツール（実在・名指し）
| ツール | 言語/出力 | ライセンス | 用途 |
|---|---|---|---|
| **KotobaMedia/mojxml-rs** | Rust / FlatGeobuf・GeoParquet・NDGeoJSON、並列高速 | MIT | 大量筆のPostGIS/タイル化に最適。`cargo install mojxml-rs`、`-a/-A`で任意座標 |
| **MIERUNE/mojxml-py**（PyPI: `mojxml`） | Python / GeoJSON・GeoPackage・FlatGeobuf | MIT | バッチ前処理。`-a`任意座標、GDAL/lxml依存 |
| **digital-go-jp/mojxml2geojson** | Python / GeoJSON（公式） | MIT | 公式の安心感、Dockerあり |

### 8.3 ETL方針
1. **MVPは自前でXMLを捌かない**：G空間情報センターの**変換済GeoJSON（公共座標系図郭）**を対象市区町村だけ取得 → `ST_MakeValid` で不正ジオメトリ修復（原本XMLは同一座標連続の不正が混在）→ `cadastral_parcels`（4326）へ ogr2ogr/COPY 投入。
2. 本格運用で原本XMLから処理する場合は **mojxml-rs（Rust）** でバッチ変換（系番号→4326変換込み）→ PostGIS ロード。
3. **地番突合**：`cadastral_parcels` と `case_parcels` を **`pref + city + oaza + aza + chiban` の正規化キー**で突合。表記ゆれは **abr-geocoder の住所正規化**を前処理に使う。突合できた筆のみ `boundary` を反映、できないものは `geo_status` を維持して別管理。
4. **版管理・監査**：`data_year` を保持し「どの年版を真とするか」「差分取込」を最初に決める。取込は `audit_logs` に記録（CLAUDE.md MVP思想）。
5. ブラウザに生GeoJSONを大量に流さない（数千超は重い）→ **対象案件周辺の筆に絞る**か **ベクタータイル化（P4）**。

---

## 9. パフォーマンス / 配信方針

- **GeoJSON直渡しの目安：〜1〜2千フィーチャ**まで実用的。MVP（1案件 数筆〜数十筆）は直渡しで開始。
- **数千〜数万ポリゴンはベクタータイル（MVT）必須**：PostGIS `ST_TileEnvelope(z,x,y)` → `ST_Transform(geom,3857)` → `ST_AsMVTGeom(extent=4096)` → `ST_AsMVT`。**保存4326・配信3857**。
- 配信は **Route Handler `app/api/tiles/parcels/[z]/[x]/[y]/route.ts`** で `bytea` を `Content-Type: application/x-protobuf` ＋ `Cache-Control` で返す（supabase-js rpc 経由なら base64 化が必要だが、Route Handler 直配信の方が効率的）。MapLibre は `addProtocol` で読込。
- さらに高負荷化したら **Martin**（MapLibre公式・Rust）を別ホストに立て Supabase 接続文字列で接続。

---

## 10. dreaMs 連動ポイント（統合の具体）

1. **案件詳細「地図」タブ**：`cases/[id]/layout.tsx` の `TabNav` に追加。`cases.latitude` / `cases.longitude` を表示し、地図クリックで案件ピンを保存する。
2. **案件作成/編集フォーム連携**：案件マスタの緯度/経度を任意入力できる。座標は必須にしない。住所・番地は既存の土地情報・関係者住所として保持する。
3. **土地（筆）タブ連携**：`case-parcels-tab.tsx`（明細テーブル）の住所・地番情報は補助情報として残す。`case_parcels.geom` / `boundary` / `geo_status` は第2段階以降の筆単位表示・計測のために維持する。
4. **案件横断の地図ビュー**：`(dashboard)/map/page.tsx` で座標付き案件を俯瞰し、CSV/Excel取り込み点を補助レイヤー表示する。`is_active_user()` ガード付きRPCで取得する。
5. **転記辞書への将来拡張（位置図・スコープ外だが布石）**：`case_parcels.geom/boundary` が入れば、背景に地理院地図＋筆ハイライトの**位置図画像/PDFを生成して申請添付**（農地転用・境界確定で必須の「位置図」「公図」）に展開できる。転記エンジン（`src/lib/transfer/*`）の出力に地図画像を足す形。NAS保存の論点（ブラウザ直書き不可→WebDAV/専用API/デスクトップ化）は位置図出力時に再検討。

---

## 11. リスク・落とし穴（実装前に必読）

- **座標系の単位ミス**：`geometry(4326)` のまま `ST_Area/ST_Length` すると単位が「度」。必ず `::geography` か平面直角座標系へ `ST_Transform` してから計測。
- **geography では編集関数が使えない**（`ST_Buffer/Union/Intersection/Simplify` は geometry 専用）。筆界編集を見込むなら geometry 保存。
- **PostGIS を public に入れない**（空間関数が PostgREST に露出しスキーマ汚染）。`extensions`/`gis` スキーマへ。
- **任意座標の筆は地図に乗らない**（全国の約半分）。自動表示せず `geo_status='arbitrary'` で別管理、必要なら人手で位置合わせ（QGISアフィン変換が一般的）。
- **地番はピンポイント座標を持たない概念**。逆ジオコーダ/abr-geocoder は代表点・町丁目どまり。正確な筆位置は法務省ポリゴン突合が必要。
- **Mapbox GL（v2+）を誤って入れない**（独自課金・トークン）。必ず maplibre-gl（BSD・キー不要）。`^5` でピン留め（v6はプレリリース）。
- **SSR落ち**：地図は `'use client'`＋`dynamic ssr:false`。**StrictMode 二重生成**は `map.remove()` クリーンアップで対処。
- **地理院タイルの出典は常時表示が義務**（折りたたみ/非表示にしない）。タイル画像のDL保存/印刷物化は別途申請。
- **MVTタイルRPCは GET の Route Handler/Edge Function**に（Server Action はPOST・キャッシュ不可で高頻度に不適）。
- **SECURITY DEFINER RPC は RLS をバイパス**→関数冒頭で `is_active_user()` 必須。
- **法務省データは公的証明ではない**旨を画面明記。**版管理・差分取込・監査**を最初に設計（履歴保持必須）。

---

## 12. 承認・意思決定が必要な事項（ユーザー確認）

着手前にユーザー承認/判断が要るもの:
1. **新規パッケージ追加**：`maplibre-gl` / `@watergis/maplibre-gl-terradraw`（+terra-draw）/ `@turf/*`（CLAUDE.md §3.2 事前承認）。
2. **PostGIS 有効化**（本番 Supabase `etngtsqidqndmwmosrff` への拡張追加・migration）。
3. **座標保存の型**：MVPは `geom geometry(Point,4326)`（本書推奨）でよいか、`lat/lng` の NUMERIC 2列で始めるか。
4. **法務省データの版運用方針**：どの年版を真とするか／差分更新の頻度。
5. **法務確認**：法務省データ・地理院タイルの利用規約原文（出典/再配布/印刷物化）の業務適合。
6. **NAS連携**（位置図出力時の論点。今回スコープ外だが将来必須）。

---

## 13. 参考リンク（出典付き）

法務省/地番データ:
- 法務省 登記所備付地図データ 一般公開（公式）: https://www.moj.go.jp/MINJI/minji05_00494.html
- G空間情報センター README: https://front.geospatial.jp/moj-chizu-xml-readme/
- 変換済 GeoJSON/Shapefile DL: https://front.geospatial.jp/moj-chizu-xml-readme/moj-chizu-shp-download/
- 地図XMLの座標系/任意座標/精度（ESRIジャパン）: https://blog.esrij.com/2023/02/10/post-48006/
- 変換ツール: https://github.com/KotobaMedia/mojxml-rs ／ https://github.com/MIERUNE/mojxml-py ／ https://github.com/digital-go-jp/mojxml2geojson
- abr-geocoder（住所/地番正規化）: https://github.com/digital-go-jp/abr-geocoder/blob/main/README.ja.md

地理院:
- 国土地理院コンテンツ利用規約: https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html
- 地理院地図 利用規約: https://maps.gsi.go.jp/help/termsofuse.html
- 地理院タイル一覧（出典リンク先）: https://maps.gsi.go.jp/development/ichiran.html
- 最適化ベクトルタイル スタイル: https://github.com/gsi-cyberjapan/optimal_bvmap

技術:
- Supabase PostGIS（Geo queries）: https://supabase.com/docs/guides/database/extensions/postgis
- Supabase ベクタータイル生成（公式ブログ）: https://supabase.com/blog（「Generate Vector Tiles with PostGIS」）
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- @watergis/maplibre-gl-terradraw: https://www.npmjs.com/package/@watergis/maplibre-gl-terradraw
- GeoJSON/SHP→ベクトルタイル（tippecanoe+gdal）: https://qiita.com/T-ubu/items/3e794ce899ded584c6aa
- 任意座標の位置合わせ（QGIS）: https://qiita.com/T-ubu/items/108e1fc28c8949a4d692

---

> **次の一手（実装担当へ）**: §12 の承認を取る → P0（PostGIS+migration 0017+依存追加）→ P1（地図ビュー＋手動ピン）。P1 完了時点で「案件の筆を地図に表示・ピン留め保存」が動くので、そこで一度ユーザーに実機確認してもらってから P2（法務省データ）へ進むのが安全。
