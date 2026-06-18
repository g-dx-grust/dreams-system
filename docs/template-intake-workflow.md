# 新様式投入ワークフロー

## 前提

現時点では新しい様式ファイル本体は未投入。既存の `docs/様式` と `docs/05申請様式` は旧様式として扱い、直接上書きしない。

新しい様式を受け取ったら、まず `docs/template-intake/` 配下に日付フォルダを作って置く。

```bash
docs/template-intake/20260603/
```

`docs/template-intake/` 配下の実ファイルは `.gitignore` で除外している。原本を誤ってコミットしないため。

## 1. 棚卸し

DB / Storage を触らずに、ファイル一覧・形式・推定カテゴリ・自治体・変換要否を出す。

```bash
pnpm templates:scan -- --source-dir "docs/template-intake/20260603"
```

出力:

```text
tmp/template-intake/template-intake-inventory.csv
tmp/template-intake/template-intake-inventory.json
```

`intakeStatus` の見方:

| status | 意味 | 次の作業 |
| --- | --- | --- |
| `generation_candidate` | `.docx` / `.xlsx` で生成テンプレート候補 | マッピング確認後に登録 |
| `needs_conversion` | `.doc` / `.xls` | Word / Excel で `.docx` / `.xlsx` に変換 |
| `reference_material` | PDF、記入例、添付書類一覧、手引き等 | 現状は生成テンプレートに入れない |
| `archived_or_old` | パスに旧版・旧様式などを含む | 原則取り込まない |
| `unsupported` | その他の形式 | 個別判断 |

## 2. 取り込み対象の選定

CSV を確認し、まずは業務頻度の高い様式だけを `generation_candidate` として選ぶ。

優先順位:

1. 農地法5条・4条の申請書、委任状、別紙
2. 土地改良区の通知書、地区除外、誓約書
3. 境界確定測量の申請書、委任状、関係土地所有者一覧
4. 建築許可・開発許可の申請書、事業計画、理由書

PDF、記入例、添付書類一覧は、将来「参照資料ライブラリ」を作るまではテンプレート管理に入れない。

## 2.5 色分けされた転記箇所の抽出

先方が様式上に色分けした箇所は、システム側の入力項目・DB構造と照合するため、登録前に抽出する。

例:

- 黄色: 氏名
- 赤: 住所
- 緑: 電話番号
- 紫: 申請場所

抽出:

```bash
pnpm templates:extract-colors -- --source-dir "docs/新様式群_20260603"
```

出力:

```text
tmp/template-color-fields/colored-template-fields.csv
tmp/template-color-fields/colored-template-fields.json
tmp/template-color-fields/field-requirements-summary.md
tmp/template-color-fields/unsupported-files.json
tmp/template-color-fields/extraction-errors.json
```

`colored-template-fields.csv` には、様式ファイル、セル/段落、色、周辺ラベル、推定入力項目、既存DBフィールド候補、DB追加要否が出る。

注意:

- `.docx` は Word の蛍光ペン、網かけ、文字色を抽出する
- `.xlsx` はセル塗り、文字色を抽出する
- `.doc` は Mac の `textutil` で一時 `.docx` に変換して抽出する。元ファイルは変更しない
- `.xls` は自動抽出対象外。Excel で `.xlsx` に変換してから再実行する
- 機械推定なので、最終的なDB項目追加前に必ず目視確認する

## 3. 一括登録

登録前に dry-run で確認する。

```bash
pnpm templates:import -- --source-dir "docs/template-intake/20260603" --dry-run
```

問題がなければ登録する。

```bash
pnpm templates:import -- --source-dir "docs/template-intake/20260603"
```

注意:

- `templates:import` は `.docx` / `.xlsx` だけを対象にする
- `.doc` / `.xls` は `scripts/convert-legacy-templates.md` の手順で変換してから登録する
- 新旧差し替えが明確なものは、画面の「新バージョンをアップロード」を使う
- まとめて追加する新規様式は一括登録、既存様式の更新は新バージョン登録、という使い分けにする

## 4. マッピング確認

登録後は `/templates` から各様式を開き、マッピング画面で確認する。

Word:

- `{applicant.name}` のような差し込み名が入っている場合は自動検出される
- 差し込み名が無い公式様式は、Word 側でプレースホルダーを埋め込んでから登録する

Excel:

- ファイル自体は原則そのまま
- マッピング画面で転記先セルをクリックしてフィールドを割り当てる

## 5. システム項目追加

新様式で既存のフィールド辞書に無い項目が必要になった場合は、テンプレートごとの一時名ではなく、案件・関係者・土地・金額のどこに属する業務項目かを決めてから追加する。

主な反映先:

| 目的 | 反映先 |
| --- | --- |
| DB項目追加 | `supabase/migrations/*.sql` |
| 型定義 | `src/server/cases.ts`, `src/types/database.ts`, `src/types/transfer.ts` |
| 入力バリデーション | `src/lib/validators/case.ts` |
| 画面入力 | `src/components/cases/*` または `src/components/persons/*` |
| 帳票転記値の組み立て | `src/lib/transfer/context-builder.ts` |
| マッピング候補辞書 | `src/lib/transfer/field-dict.ts` |
| テスト | `tests/unit/transfer/*` |

判断基準:

- 複数様式で使う値は正式なシステム項目として追加する
- 一つの様式だけの補足文は、まず `caseMemo` や `description` で足りるか確認する
- 住所・氏名・土地・面積・日付・金額は既存フィールドとの重複を避ける
- 追加後はマッピング辞書に日本語ラベルも登録する

## 6. 将来のユーザーアップロード

現状の画面は管理者アップロード前提で `.docx` / `.xlsx` を受け付ける。ユーザーアップロードを開放する場合は、以下を追加する。

- アップロード者ロールを `admin` 以外にも許可する
- 登録直後は生成に使わない `review_required` 状態にする
- 管理者がマッピング確認後に有効化する
- PDF / 記入例はテンプレートではなく参照資料として別管理にする
