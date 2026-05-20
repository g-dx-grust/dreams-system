# 旧様式（.doc / .xls）→ 現行様式（.docx / .xlsx）変換手順書

> see: docs/phase1/03_template_inventory.md

## 方針

本番ランタイム（Vercel）では **LibreOffice を使わない**。旧様式は管理者がローカル Mac で前処理し、変換後の `.docx` / `.xlsx` のみ Supabase Storage にアップロードする。

---

## 手順

### 1. 原本を開く

- `.doc` は **Microsoft Word**（推奨）または **LibreOffice Writer** で開く
- `.xls` は **Microsoft Excel**（推奨）または **LibreOffice Calc** で開く

### 2. 形式を変換して保存

- Word: `ファイル > 名前を付けて保存 > .docx`
- Excel: `ファイル > 名前を付けて保存 > .xlsx`
- ファイル名は原本と同じ（拡張子のみ変える）

### 3. 目視確認

以下を確認してから登録する。

- [ ] レイアウト崩れ（表のセル幅・行高さ）
- [ ] フォント置換（MS 明朝 → 代替フォント）
- [ ] 図・画像の位置（印鑑欄・ロゴ）
- [ ] ページ数が原本と一致する
- [ ] 差し込み対象の欄が崩れていない

### 4. プレースホルダーの埋め込み

docxtemplater / exceljs の記法に従って差し込み記号を埋め込む。詳細は `docs/phase1/03_template_inventory.md §差し込み方式` を参照。

- Word: `{applicant.name}` のように **波括弧 1 つ** で直接入力
- Word の繰り返し：`{#parcels}` ... `{/parcels}` でセクションを囲む
- Excel: セル座標 `B5` または名前定義 `applicant_name` をマッピング設定に登録

### 5. ハイライト対象の明示

転記箇所を視覚化する場合、該当のプレースホルダーを含む Run（文字範囲）を **Word の黄色ハイライトで事前に塗っておく**。生成時にハイライトが保持される。

### 6. Supabase Storage にアップロード

- 管理者ユーザーでログイン
- `/templates`（テンプレート管理画面、Phase 3 で実装）からアップロード
- 格納先：`templates/{category_slug}/{template_id}_v{version}.{docx|xlsx}`

---

## 一括変換（任意）

ローカルに LibreOffice CLI が入っている場合は以下で一括変換できる。
**CI/CD からは呼ばない**（本番ランタイムでは未使用）。

```bash
# 例: 農地転用許可の .doc を一括変換
cd docs/様式/農地転用許可
for f in *.doc; do
    soffice --headless --convert-to docx "$f"
done
```

---

## 優先変換リスト（MVP 最初の 10 件）

see: docs/phase1/03_template_inventory.md §優先実装 10 テンプレート

1. 5条許可申請書（農地転用許可）
2. 5条許可委任状（農地転用許可）
3. 事業計画書（農地転用許可）
4. 隣地承諾書（農地転用許可）
5. 農転4条、5条 別紙（農地転用許可）
6. 01農地転用等の通知書（土地改良区）
7. 03誓約書（転用組合員）（土地改良区）
8. 誓約書（必ずつける）（土地改良区）
9. 公共用地境界確定申請書（境界確定測量）
10. 申請書（建築許可）
