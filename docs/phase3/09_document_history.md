# Phase 3-3: 帳票生成履歴・監査ログ仕様

## 帳票生成履歴

### 保存内容

帳票を生成するたびに `document_histories` テーブルに以下を記録します。

| フィールド | 内容 |
|-----------|------|
| `case_id` | 案件ID |
| `template_id` | 使用したテンプレートID |
| `version` | 同案件・同テンプレートでの生成回数 |
| `file_name` | 生成ファイル名（命名規則に従う） |
| `file_path` | ストレージ内のパス |
| `file_type` | `docx` / `xlsx` |
| `transferred_data` | 転記した値のスナップショット（JSON） |
| `highlight_enabled` | ハイライト ON/OFF |
| `generated_by_user_id` | 生成者 |
| `created_at` | 生成日時 |

### transferred_data の構造

```json
{
  "applicant.name": "田中 太郎",
  "applicant.address_full": "愛知県豊橋市大岩町字大穴1-1",
  "parcels[0].chiban": "123-4",
  "today": "令和6年3月15日"
}
```

### バージョン採番

同一案件・同一テンプレートで複数回生成した場合、バージョンを自動インクリメントする。

```ts
// src/server/documents.ts（抜粋）
async function nextDocumentVersion(caseId: number, templateId: number): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_histories")
    .select("version")
    .eq("case_id", caseId)
    .eq("template_id", templateId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version ?? 0) + 1;
}
```

### ダウンロード

Route Handler でバイナリをストリーム配信する（`04_api_design.md` の「ダウンロード（Route Handler）」参照）：

```
GET /api/documents/{id}/download
```

- 認証チェック：Route Handler 内で `getCurrentUser()` を必ず呼ぶ（middleware の matcher から除外しているため）
- レスポンス：`Content-Disposition: attachment; filename*=UTF-8''<URL エンコード名>` を付与
- ファイル本体は Supabase Storage の `documents` バケットから `download()` で取得

---

## 監査ログ

### 記録対象アクション

| アクション | `action` 値 | 記録内容 |
|-----------|------------|---------|
| 案件作成 | `case.create` | 作成した案件データ |
| 案件更新 | `case.update` | 変更前後の差分 |
| 案件削除 | `case.delete` | 削除した案件データ |
| 人マスタ作成 | `person.create` | 作成した人物データ |
| 人マスタ更新 | `person.update` | 変更前後の差分 |
| 人マスタ削除 | `person.delete` | 削除した人物データ |
| 関係者追加 | `case_person.add` | 追加した関係者・役割 |
| スナップショット再同期 | `case_person.resync` | 同期前後の差分 |
| 帳票生成 | `document.generate` | 案件ID・テンプレートID・ファイル名 |
| テンプレートアップロード | `template.upload` | テンプレート名・カテゴリ |
| テンプレート無効化 | `template.deactivate` | テンプレートID |
| 帳票ダウンロード | `document.download` | 案件ID・帳票履歴ID・ファイル名・一括ZIPかどうか |
| ログイン | `auth.login` | ユーザー名・IPアドレス |
| ログアウト | `auth.logout` | |

### 監査ログ実装

```ts
// src/lib/audit.ts
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export type AuditInput = {
  userId: string;
  action: string;
  entityType?: string;
  entityId?: number | string;
  detail?: Record<string, unknown>;
};

export async function logAudit(input: AuditInput): Promise<void> {
  const supabase = await createClient();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? h.get("x-real-ip")
    ?? null;

  await supabase.from("audit_logs").insert({
    user_id: input.userId,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId != null ? Number(input.entityId) : null,
    detail: input.detail ?? null,
    ip_address: ip,
  });
}

export function diffDict(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { before: unknown; after: unknown }> {
  const changed: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    if (before?.[k] !== after?.[k]) {
      changed[k] = { before: before?.[k], after: after?.[k] };
    }
  }
  return changed;
}
```

### 監査ログ閲覧画面（管理者のみ）

**フィルタ：**
- アクション種別
- エンティティ種別・ID
- ユーザー
- 日付範囲

**表示項目：**
- 日時
- ユーザー名
- アクション
- 対象（エンティティ種別・ID）
- 詳細（JSON展開表示）
- IPアドレス
