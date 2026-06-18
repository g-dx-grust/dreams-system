# 色分け転記箇所 抽出結果

抽出行数: 386
未対応/要変換ファイル: 3
抽出エラー: 0

## 入力項目候補

| 入力項目 | 既存DBフィールド候補 | 表示名 | 件数 |
| --- | --- | --- | ---: |
| 住所 | `applicant.addressFull` | 申請者住所 | 321 |
| 氏名 | `applicant.name` | 申請者氏名 | 15 |
| 要確認 | `未推定` |  | 14 |
| 住所 | `agent.addressFull` | 代理人/行政書士住所 | 12 |
| 金額・費用項目 | `未推定` |  | 9 |
| 日付 | `today` | 生成日（和暦） | 7 |
| 電話番号 | `applicant.phone` | 申請者電話番号 | 4 |
| 地積・面積 | `parcel.area` | 地積 | 3 |
| 氏名 | `agent.name` | 代理人/行政書士氏名 | 1 |

## 色別件数

| 色 | 件数 |
| --- | ---: |
| red | 362 |
| blue | 24 |

## DB反映判断

| 状態 | 件数 |
| --- | ---: |
| existing | 363 |
| review_required | 23 |

## 要確認サンプル

| 様式 | 位置 | 色 | 周辺ラベル | 値 | 推定 |
| --- | --- | --- | --- | --- | --- |
| dreaMs様/行政書士業務/農地法/農地法4条許可/4条許可申請書.doc | word/document.xml paragraph:52 | blue |  | （空欄） | 要確認 |
| dreaMs様/行政書士業務/農地法/農地法4条許可/4条許可申請書.doc | word/document.xml paragraph:52 | blue |  | （空欄） | 要確認 |
| dreaMs様/行政書士業務/農地法/農地法4条許可/4条許可申請書.doc | word/document.xml paragraph:54 | blue |  | （空欄） | 要確認 |
| dreaMs様/行政書士業務/農地法/農地法4条許可/4条許可申請書.doc | word/document.xml paragraph:55 | blue |  | （空欄） | 要確認 |
| dreaMs様/行政書士業務/農地法/農地法4条許可/4条許可申請書.doc | word/document.xml paragraph:55 | blue |  | （空欄） | 要確認 |
| dreaMs様/行政書士業務/農地法/農地法4条許可/4条許可申請書.doc | word/document.xml paragraph:55 | blue |  | （空欄） | 要確認 |
| dreaMs様/行政書士業務/農地法/農地法4条許可/4条許可申請書.doc | word/document.xml paragraph:56 | blue |  | （空欄） | 要確認 |
| dreaMs様/行政書士業務/農地法/農地法4条許可/4条許可申請書.doc | word/document.xml paragraph:57 | blue |  | （空欄） | 要確認 |
| dreaMs様/行政書士業務/農地法/農地法4条許可/4条許可申請書.doc | word/document.xml paragraph:57 | blue |  | （空欄） | 要確認 |
| dreaMs様/行政書士業務/農地法/農地法4条許可/4条許可申請書.doc | word/document.xml paragraph:57 | blue |  | （空欄） | 要確認 |
| dreaMs様/行政書士業務/農地法/農地法4条許可/4条許可申請書.doc | word/document.xml paragraph:58 | blue |  | （空欄） | 金額・費用項目 |
| dreaMs様/行政書士業務/農地法/農地法4条許可/4条許可申請書.doc | word/document.xml paragraph:58 | blue |  | （空欄） | 金額・費用項目 |
| dreaMs様/土地家屋調査士業務/建物登記/Y2026-018浜松市中央区初生町：玉腰裕規、明日野（エスコネクト）.xlsx | 入力 B6 | blue |  | （空欄） | 要確認 |
| dreaMs様/土地家屋調査士業務/建物登記/Y2026-018浜松市中央区初生町：玉腰裕規、明日野（エスコネクト）.xlsx | 入力 I6 | blue | 源泉所得税 / Y2026-018 / 山本真基 | なし | 金額・費用項目 |
| dreaMs様/土地家屋調査士業務/建物登記/Y2026-018浜松市中央区初生町：玉腰裕規、明日野（エスコネクト）.xlsx | 入力 L62 | red | SUM(H60:H61) | 登記事項証明書 | 金額・費用項目 |
| dreaMs様/土地家屋調査士業務/建物登記/Y2026-018浜松市中央区初生町：玉腰裕規、明日野（エスコネクト）.xlsx | 入力 M62 | red | 登記事項証明書 | 550 | 金額・費用項目 |
| dreaMs様/土地家屋調査士業務/建物登記/Y2026-018浜松市中央区初生町：玉腰裕規、明日野（エスコネクト）.xlsx | 入力 L63 | red | 133870 / 登記事項証明書 | 登記事項要約書 | 金額・費用項目 |
| dreaMs様/土地家屋調査士業務/建物登記/Y2026-018浜松市中央区初生町：玉腰裕規、明日野（エスコネクト）.xlsx | 入力 M63 | red | 登記事項要約書 / 550 | 500 | 金額・費用項目 |
| dreaMs様/土地家屋調査士業務/建物登記/Y2026-018浜松市中央区初生町：玉腰裕規、明日野（エスコネクト）.xlsx | 入力 L64 | red | 0 / 登記事項要約書 / 登記事項証明書 | 地図等 | 金額・費用項目 |
| dreaMs様/土地家屋調査士業務/建物登記/Y2026-018浜松市中央区初生町：玉腰裕規、明日野（エスコネクト）.xlsx | 入力 L65 | red | 133870 / 地図等 / 登記事項要約書 / 登記事項証明書 | ｲﾝﾀｰﾈｯﾄ全部事項 | 金額・費用項目 |
| dreaMs様/土地家屋調査士業務/建物登記/建物申述書.doc | word/document.xml paragraph:4 | blue |  | 豊橋市大岩町字北元屋敷４０番地１２ | 要確認 |
| dreaMs様/土地家屋調査士業務/建物登記/建物申述書.doc | word/document.xml paragraph:5 | blue |  | ４０番１２ | 要確認 |
| dreaMs様/土地家屋調査士業務/建物登記/建物申述書.doc | word/document.xml paragraph:7 | blue |  | 木造合金メッキ鋼板ぶき平家建 | 要確認 |

## 未対応/要変換ファイル

| ファイル | 理由 |
| --- | --- |
| dreaMs様/行政書士業務/開発許可/豊橋市/現地調査（事前審査）依頼票.xls | .xls must be converted to .xlsx |
| dreaMs様/行政書士業務/建築許可/豊橋市/現地調査（事前審査）依頼票.xls | .xls must be converted to .xlsx |
| dreaMs様/行政書士業務/建築許可/豊川市/調査書（令和3年度）.xls | .xls must be converted to .xlsx |

## 注意

- 既存DBフィールド候補は、色と周辺ラベルからの機械推定です。最終マッピング前に目視確認してください。
- `.doc` は `textutil` で一時 `.docx` 変換して抽出します。元ファイルは変更しません。
- `.xls` は現時点では自動抽出対象外です。Excelで `.xlsx` に変換後、再実行してください。
