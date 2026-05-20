# フィールド辞書（TransferContext 全フィールド一覧）

マッピング設定画面でフィールドパスを選択する際の参照資料です。

---

## 案件基本情報

| フィールドパス | 表示名 | 例 |
|--------------|--------|-----|
| `case_number` | 案件番号 | 2024-FC-001 |
| `case_name` | 案件名 | 豊川市御津町 農地転用許可申請 |
| `case_type_label` | 案件種別（日本語） | 農地転用許可 |
| `submission_target` | 提出先 | 豊川市農業委員会 |
| `submission_date` | 提出日 | 令和6年3月15日 |
| `deadline_date` | 締切日 | 令和6年4月1日 |
| `today` | 生成日（和暦） | 令和6年3月15日 |
| `today_year` | 生成年（和暦） | 令和6年 |
| `today_month` | 生成月 | 3 |
| `today_day` | 生成日 | 15 |

---

## 申請者（applicant）

| フィールドパス | 表示名 | 例 |
|--------------|--------|-----|
| `applicant.name` | 申請者氏名 | 田中 太郎 |
| `applicant.name_kana` | 申請者フリガナ | タナカ タロウ |
| `applicant.zip` | 申請者郵便番号 | 441-8077 |
| `applicant.address_pref` | 申請者都道府県 | 愛知県 |
| `applicant.address_city` | 申請者市区町村 | 豊橋市 |
| `applicant.address_town` | 申請者町域 | 大岩町 |
| `applicant.address_line1` | 申請者番地 | 字大穴1-1 |
| `applicant.address_line2` | 申請者建物名 | |
| `applicant.address_full` | 申請者住所（全体） | 愛知県豊橋市大岩町字大穴1-1 |
| `applicant.address_no_pref` | 申請者住所（都道府県除く） | 豊橋市大岩町字大穴1-1 |
| `applicant.phone` | 申請者電話番号 | 0532-51-1234 |
| `applicant.fax` | 申請者FAX | |
| `applicant.email` | 申請者メール | |

---

## 譲受人（transferee）

| フィールドパス | 表示名 |
|--------------|--------|
| `transferee.name` | 譲受人氏名 |
| `transferee.address_full` | 譲受人住所（全体） |
| `transferee.phone` | 譲受人電話番号 |
| ※ applicant と同じフィールド構成 | |

---

## 譲渡人（transferor）

| フィールドパス | 表示名 |
|--------------|--------|
| `transferor.name` | 譲渡人氏名 |
| `transferor.address_full` | 譲渡人住所（全体） |
| ※ applicant と同じフィールド構成 | |

---

## 代理人・行政書士（agent）

| フィールドパス | 表示名 |
|--------------|--------|
| `agent.name` | 代理人氏名 |
| `agent.address_full` | 代理人住所（全体） |
| `agent.phone` | 代理人電話番号 |
| ※ applicant と同じフィールド構成 | |

---

## 請求先（billing）

| フィールドパス | 表示名 |
|--------------|--------|
| `billing.name` | 請求先氏名・法人名 |
| `billing.address_full` | 請求先住所（全体） |
| ※ applicant と同じフィールド構成 | |

---

## 隣地所有者（neighbor）

| フィールドパス | 表示名 |
|--------------|--------|
| `neighbor.name` | 隣地所有者氏名（1人目） |
| `neighbor.address_full` | 隣地所有者住所（1人目） |
| `neighbors[0].name` | 隣地所有者氏名（1人目） |
| `neighbors[1].name` | 隣地所有者氏名（2人目） |
| ※ 複数人いる場合は `neighbors[n]` で参照 | |

---

## 土地情報（1筆目ショートカット）

| フィールドパス | 表示名 | 例 |
|--------------|--------|-----|
| `parcel.pref` | 所在都道府県 | 愛知県 |
| `parcel.city` | 所在市区町村 | 豊川市 |
| `parcel.aza` | 大字・字 | 御津町広石 |
| `parcel.chiban` | 地番 | 123-4 |
| `parcel.location_full` | 所在地（市区町村〜地番） | 豊川市御津町広石123-4 |
| `parcel.chimoku` | 地目 | 田 |
| `parcel.area` | 地積（㎡） | 500.00 |
| `parcel.tenyo_area` | 転用面積（㎡） | 300.00 |

---

## 土地情報（複数筆）

| フィールドパス | 表示名 |
|--------------|--------|
| `parcels[0].chiban` | 1筆目 地番 |
| `parcels[0].chimoku` | 1筆目 地目 |
| `parcels[0].area` | 1筆目 地積 |
| `parcels[1].chiban` | 2筆目 地番 |
| `total_area` | 地積合計（㎡） |
| `total_tenyo_area` | 転用面積合計（㎡） |

**繰り返し（Wordテンプレート用）：**
```
{% for parcel in parcels %}
{{parcel.location_full}} {{parcel.chimoku}} {{parcel.area}}㎡
{% endfor %}
```

---

## 金額情報

| フィールドパス | 表示名 | 例 |
|--------------|--------|-----|
| `estimate_amount` | 見積金額（税抜） | 100,000 |
| `estimate_amount_tax` | 消費税額 | 10,000 |
| `estimate_amount_total` | 見積金額（税込） | 110,000 |
| `invoice_amount` | 請求金額（税抜） | 100,000 |
| `invoice_amount_tax` | 請求消費税額 | 10,000 |
| `invoice_amount_total` | 請求金額（税込） | 110,000 |
