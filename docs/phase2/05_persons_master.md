# Phase 2-2: 人マスタ機能仕様

## 概要

人マスタは「顧客・関係者の住所録」です。一度登録した人物情報を複数の案件で使い回すことで、重複入力を排除します。

---

## データ項目定義

| フィールド | 表示名 | 必須 | 備考 |
|-----------|--------|------|------|
| `person_type` | 区分 | ○ | 個人 / 法人 |
| `name` | 氏名・法人名 | ○ | 最大200文字 |
| `name_kana` | フリガナ | - | カタカナ |
| `zip` | 郵便番号 | - | ハイフンなし7桁で保存 |
| `address_pref` | 都道府県 | - | |
| `address_city` | 市区町村 | - | |
| `address_town` | 町域・大字 | - | |
| `address_line1` | 番地 | - | |
| `address_line2` | 建物名・部屋番号 | - | |
| `phone` | 電話番号 | - | ハイフンなしで保存 |
| `fax` | FAX番号 | - | |
| `email` | メールアドレス | - | |
| `corporate_number` | 法人番号 | - | 法人のみ |
| `representative_name` | 代表者氏名 | - | 法人のみ |
| `memo` | メモ | - | 自由記述 |

---

## 画面仕様

### 人マスタ一覧画面

**レイアウト：** テーブル形式（PC）/ カード形式（スマホ）

**表示カラム：**
- 区分（個人/法人バッジ）
- 氏名・フリガナ
- 住所（都道府県＋市区町村＋町域まで）
- 電話番号
- 登録日
- 操作（詳細・編集・削除）

**検索・フィルタ：**
- フリーワード検索（氏名・フリガナ・住所の部分一致）
- 区分フィルタ（個人/法人/全て）

**ソート：** 氏名（あいうえお順）、登録日（新しい順）

### 人マスタ登録・編集画面

**フォーム構成：**

1. **基本情報セクション**
   - 区分（ラジオボタン: 個人/法人）
   - 氏名（テキスト）
   - フリガナ（テキスト）

2. **住所セクション**
   - 郵便番号（7桁入力 → 自動住所補完ボタン）
   - 都道府県（セレクト）
   - 市区町村（テキスト）
   - 町域・大字（テキスト）
   - 番地（テキスト）
   - 建物名・部屋番号（テキスト）

3. **連絡先セクション**
   - 電話番号
   - FAX番号
   - メールアドレス

4. **法人情報セクション**（区分=法人の場合のみ表示）
   - 法人番号
   - 代表者氏名

5. **メモセクション**

**重複チェック：** 氏名入力後（フォーカスアウト時）に類似候補を自動検索し、「この人物が既に登録されている可能性があります」とインライン警告を表示します。

### 人マスタ詳細画面

**タブ構成：**
- **基本情報** — 登録情報の表示・編集ボタン
- **関連案件** — この人物が関係者として紐付いている案件一覧（役割・案件名・ステータス）

---

## 住所自動補完

郵便番号から住所を自動補完します。

**実装方針：** `zipcloud` API（`https://zipcloud.ibsnet.co.jp/api/search?zipcode=4418077`）を使用します。フロントエンドから直接呼び出します。

```typescript
// hooks/useZipSearch.ts
const searchZip = async (zip: string) => {
  const res = await fetch(
    `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zip.replace('-', '')}`
  );
  const data = await res.json();
  if (data.results?.[0]) {
    const r = data.results[0];
    setValue('address_pref', r.address1);
    setValue('address_city', r.address2);
    setValue('address_town', r.address3);
  }
};
```

---

## 重複候補検出ロジック

**正規化処理（Server Action 内で実行し `persons.name_normalized` に保存）：**

```ts
// src/lib/normalize.ts
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")                 // 全角英数字・半角カナを正規化
    .replace(/[\s　・]/g, "")      // 半角/全角スペース・中点を除去
    .toLowerCase();
}
```

**類似度判定：** Postgres の `pg_trgm` 拡張を使い、`name_normalized` に対して類似度検索を行う（02_db_schema.md で GIN インデックスを定義済み）。`similarity()` 値 0.5 以上を候補として返す目安。

```ts
// src/server/persons.ts（抜粋）
export async function findDuplicates(query: string) {
  await requireActiveUser();
  const supabase = await createClient();
  const normalized = normalizeName(query);
  const { data } = await supabase.rpc("find_person_duplicates", {
    p_query: normalized,
    p_threshold: 0.5,
  });
  return { ok: true as const, data: data ?? [] };
}
```

対応する DB 関数：

```sql
CREATE OR REPLACE FUNCTION public.find_person_duplicates(
    p_query TEXT,
    p_threshold REAL DEFAULT 0.5
)
RETURNS TABLE (
    id INT,
    name TEXT,
    name_kana TEXT,
    address_pref TEXT,
    address_city TEXT,
    similarity REAL
) AS $$
    SELECT
        id, name, name_kana, address_pref, address_city,
        similarity(name_normalized, p_query) AS sim
    FROM public.persons
    WHERE name_normalized % p_query
      AND similarity(name_normalized, p_query) >= p_threshold
    ORDER BY sim DESC
    LIMIT 10;
$$ LANGUAGE sql STABLE SECURITY INVOKER;
```

---

## 案件への紐付けフロー

1. 案件詳細画面の「関係者」タブで「関係者を追加」ボタンをクリック
2. 人マスタ検索モーダルが開く（氏名・住所で検索可能）
3. 対象人物を選択し、役割（申請者/代理人/隣地所有者など）を指定
4. 「追加」ボタンで紐付け完了
   - この時点で人マスタの現在値がスナップショットとして `case_persons` に保存される
5. 案件詳細の関係者一覧に表示される

**スナップショット再同期：**
- 人マスタを後日更新した場合、案件の関係者欄に「マスタと差異あり」バッジが表示される
- 「マスタから再同期」ボタンで最新値を取り込める
- 再同期は監査ログに記録される

---

## バリデーションルール

| フィールド | ルール |
|-----------|--------|
| `name` | 必須、1〜200文字 |
| `name_kana` | カタカナ・スペース・長音符のみ |
| `zip` | 7桁数字（ハイフン除去後） |
| `phone` | 数字・ハイフンのみ、10〜13桁 |
| `email` | RFC5322準拠 |
| `corporate_number` | 13桁数字（法人番号） |
