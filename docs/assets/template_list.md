# 様式一覧・プレースホルダー設計ガイド

## 様式一覧（デモシステムより）

### カテゴリ: 農地転用許可（farmland_conversion）

| 様式名 | 形式 | 主な転記フィールド |
|--------|------|-----------------|
| 5条許可申請書 | DOCX | applicant.name, applicant.address_full, parcels, today |
| 5条許可委任状 | DOCX | applicant.name, agent.name, agent.address_full, today |
| 事業計画書 | DOCX | applicant.name, parcels, total_tenyo_area |
| 農転4条・5条別紙 | XLSX | parcels（複数筆対応） |
| 農地転用許可申請書（4条） | DOCX | applicant.name, applicant.address_full, parcels |
| 農地転用許可申請書（5条） | DOCX | applicant.name, transferee.name, parcels |

### カテゴリ: 土地改良区（land_improvement）

| 様式名 | 形式 | 主な転記フィールド |
|--------|------|-----------------|
| 農地転用等の通知書（豊川総合用水） | DOCX | applicant.name, parcels, today |
| 農地転用等の通知書（豊橋南部） | DOCX | applicant.name, parcels, today |
| 地区除外申請書 | DOCX | applicant.name, applicant.address_full, parcels |
| 誓約書（転用組合員） | DOCX | applicant.name, today |
| 工事完了届 | DOCX | applicant.name, case_number, today |

### カテゴリ: 境界確定測量（boundary_survey）

| 様式名 | 形式 | 主な転記フィールド |
|--------|------|-----------------|
| 公共用地境界確定申請書（豊川市） | DOCX | applicant.name, applicant.address_full, parcels, today |
| 公共用地境界確定申請書（豊橋市） | DOCX | applicant.name, applicant.address_full, parcels, today |
| 立会委任状 | DOCX | applicant.name, agent.name, today |
| 境界確認書 | DOCX | applicant.name, neighbor.name, today |

### カテゴリ: 建築許可（building_permit）

| 様式名 | 形式 | 主な転記フィールド |
|--------|------|-----------------|
| 申請書 | DOCX | applicant.name, applicant.address_full, parcels |
| 理由書 | DOCX | applicant.name, case_name |
| 事業計画書 | DOCX | applicant.name, parcels |
| 委任状 | DOCX | applicant.name, agent.name, today |

---

## プレースホルダー設計ガイド

既存の様式ファイルを Claude Code でテンプレート化する際の指針です。

### Word（DOCX）テンプレートの作成手順

1. 既存の様式ファイル（.doc/.docx）を開く
2. 転記したい箇所を `{{フィールドパス}}` に置き換える
3. 複数筆の繰り返し箇所は `{% for parcel in parcels %}...{% endfor %}` で囲む
4. 未入力時に空白にしたい場合は `{{applicant.name | default('')}}` とする
5. 全角スペースで埋めたい場合は `{{applicant.name | default('　')}}` とする

### 置き換え例

**変換前（元の様式）：**
```
申請者　住所　　　　　　　　　　　　　　　　
　　　　氏名　　　　　　　　　　　　　　　　
```

**変換後（テンプレート）：**
```
申請者　住所　{{applicant.address_full}}
　　　　氏名　{{applicant.name}}
```

### Excel（XLSX）テンプレートの作成手順

1. 既存の様式ファイル（.xls/.xlsx）を開く
2. 転記したいセルの座標（例: B5）とフィールドパスの対応表を作成する
3. テンプレートファイル自体は変更しない（セル座標でマッピングするため）
4. マッピング設定画面でセル座標とフィールドパスを登録する

### マッピング設定例（Excel）

| プレースホルダー（セル座標） | フィールドパス | 表示名 | 必須 |
|--------------------------|--------------|--------|------|
| B3 | today | 申請日 | × |
| B5 | applicant.name | 申請者氏名 | ○ |
| C5 | applicant.address_full | 申請者住所 | ○ |
| B8 | parcels[0].chiban | 地番（1筆目） | ○ |
| C8 | parcels[0].chimoku | 地目（1筆目） | × |
| D8 | parcels[0].area | 地積（1筆目） | × |

---

## 様式変換の優先順位

本格実装時に既存様式をテンプレート化する優先順位です。

**優先度 高（業務頻度が高い）：**
1. 5条許可申請書
2. 5条許可委任状
3. 農地転用等の通知書（豊川総合用水・豊橋南部）
4. 公共用地境界確定申請書（豊川市・豊橋市）

**優先度 中：**
5. 地区除外申請書
6. 事業計画書
7. 立会委任状

**優先度 低（使用頻度が低い）：**
8. その他の様式
