# Phase 3-2: テンプレート管理・マッピング設定仕様

## 概要

テンプレート管理機能は、様式ファイルのアップロード・分類・マッピング設定・バージョン管理を行います。管理者のみが操作できます。

---

## テンプレート管理画面

### テンプレート一覧

**表示項目：**
- カテゴリ（タブまたはサイドフィルタ）
- 様式名
- ファイル形式（DOCX/XLSX バッジ）
- バージョン
- 対応案件種別（バッジ）
- マッピング数
- 有効/無効ステータス
- 操作（マッピング設定・無効化・ダウンロード）

**フィルタ：**
- カテゴリ（土地改良区/境界確定測量/建築許可/農地転用許可）
- 対応案件種別
- 有効のみ表示（デフォルト ON）

### テンプレートアップロード

**フォーム項目：**

| 項目 | 入力形式 | 必須 |
|------|---------|------|
| ファイル | ファイル選択（.docx/.xlsx） | ○ |
| 様式名 | テキスト（ファイル名から自動入力） | ○ |
| カテゴリ | セレクト | ○ |
| 対応案件種別 | チェックボックス（複数選択可） | - |
| 説明 | テキストエリア | - |

**バリデーション：**
- ファイル形式: `.docx` / `.xlsx` のみ
- ファイルサイズ: 最大 10MB
- 同名ファイルの場合: 新バージョンとして登録（既存は保持）

### マッピング設定画面

テンプレートのプレースホルダーと案件データフィールドの対応を設定します。

**レイアウト：**
- 左カラム: テンプレートファイルのプレビュー（iframe または画像）
- 右カラム: マッピング設定テーブル

**マッピングテーブルの項目：**

| 列 | 説明 |
|----|------|
| プレースホルダー | テンプレート内の `{{xxx}}` またはセル座標 |
| フィールドパス | TransferContext のパス（例: `applicant.name`） |
| 表示名 | 日本語ラベル（例: 申請者氏名） |
| 必須 | チェックボックス |
| 操作 | 削除 |

**フィールドパス選択：** ドロップダウンでフィールド辞書から選択できるようにします（`assets/field_dictionary.md` 参照）。

**プレースホルダー自動検出（DOCX）：**

アップロード時に DOCX を ZIP として開き、`word/document.xml`・`word/header*.xml`・`word/footer*.xml` を対象に `{フィールドパス}`（波括弧 1 つ）を抽出する。

```ts
// src/lib/transfer/detect-placeholders.ts
import PizZip from "pizzip";

const PLACEHOLDER_RE = /\{([^{}#/][^{}]*)\}/g;
// docxtemplater の制御タグ（{#...}, {/...}, {^...}）は除外

const TARGET_XMLS = [
  "word/document.xml",
  "word/header1.xml", "word/header2.xml", "word/header3.xml",
  "word/footer1.xml", "word/footer2.xml", "word/footer3.xml",
];

export function detectPlaceholdersInDocx(buffer: ArrayBuffer): string[] {
  const zip = new PizZip(buffer);
  const found = new Set<string>();
  for (const path of TARGET_XMLS) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = file.asText();
    // XML の <w:t> 境界で {...} が分断されるケースがあるので、先にタグを除去
    const plain = xml.replace(/<[^>]+>/g, "");
    for (const m of plain.matchAll(PLACEHOLDER_RE)) {
      found.add(m[1].trim());
    }
  }
  return Array.from(found).sort();
}
```

> 注意：Word が同じ `{...}` を複数の Run に分割して保存するケースがあり、XML タグを除去してから走査するのがポイント。docxtemplater 側は内部で Run 結合をしているため、検出器だけが別ロジックになる。

---

## テンプレートバージョン管理

同じ様式の新しいバージョンをアップロードした場合の挙動：

1. 既存テンプレートは `is_active = FALSE` に変更
2. 新テンプレートを `version = 旧バージョン + 1` で登録
3. 旧バージョンのマッピングを新バージョンにコピー（自動）
4. 旧バージョンで生成した帳票履歴は引き続き参照可能

**バージョン管理の実装：**

Server Action `uploadTemplateNewVersion(templateId, formData)` を用意する（`04_api_design.md` の「テンプレート」セクション参照）。処理内容：

1. `requireAdmin()`
2. FormData から新しいファイルを取得・拡張子チェック
3. Supabase Storage に `templates/{slug}/{templateId}_v{next}.{ext}` で保存
4. 旧レコードを `is_active = FALSE` に
5. 新レコードを INSERT（`version = 旧 + 1`、`applicable_case_types` と `template_mappings` は旧からコピー）
6. `audit_logs` に `template.upload` を記録
7. `revalidatePath("/templates")`

---

## テンプレートと案件種別の紐付け

`templates.applicable_case_types` に JSON 配列で対応案件種別を保存します。

```json
["farmland_conversion", "land_improvement"]
```

案件詳細の「帳票生成」タブでは、案件の `case_type` に一致するテンプレートのみ表示します。

**対応案件種別が未設定のテンプレート** は全案件種別で表示されます（汎用様式として扱う）。
