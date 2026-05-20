# Phase 2-1: Server Actions / Route Handlers 設計

## 設計方針

- **データ取得・変更は Server Actions を第一選択**（`"use server"` 付きの非同期関数を直接 Client Component から呼ぶ）
- **Route Handlers（`app/api/*/route.ts`）は限定的に使う**：
  - 外部システムへ公開する必要がある場合のみ
  - Supabase Auth の OAuth コールバック（`app/(auth)/callback/route.ts`）
  - バイナリファイルのストリーム配信（帳票ダウンロード）
- **認証**：Supabase Auth（Google Workspace SSO 想定）。Server Action / Route Handler では `@supabase/ssr` の `createServerClient()` でセッション付きクライアントを取得
- **認可**：RLS（DB 層）＋ Server Action 冒頭で `requireActiveUser()` / `requireAdmin()` を呼ぶ（アプリ層）の二重防衛
- **入力バリデーション**：zod スキーマを単一ソースに `z.infer` で型を導出
- **エラー**：例外で制御フローを作らず `Result<T, E>` 風の戻り値を返す（`{ ok: true, data }` / `{ ok: false, error }`）
- **ページネーション**：`{ page: 1, perPage: 20 }`（デフォルト 20、最大 100）
- **監査ログ**：変更系（create / update / delete / generate / resync）は Server Action 内で `logAudit()` を呼ぶ

---

## 共通パターン

### Server Action の雛形

```ts
// src/server/persons.ts
"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireActiveUser, requireAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

const PersonUpsertSchema = z.object({
  person_type: z.enum(["individual", "corporation"]),
  name: z.string().min(1).max(200),
  name_kana: z.string().max(200).optional(),
  zip: z.string().max(10).optional(),
  address_pref: z.string().max(20).optional(),
  address_city: z.string().max(50).optional(),
  address_town: z.string().max(100).optional(),
  address_line1: z.string().max(200).optional(),
  address_line2: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  memo: z.string().optional(),
});
export type PersonUpsertInput = z.infer<typeof PersonUpsertSchema>;

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string };

export async function createPerson(
  input: PersonUpsertInput,
): Promise<ActionResult<{ id: number }>> {
  const user = await requireActiveUser();
  const parsed = PersonUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("persons")
    .insert({ ...parsed.data, name_normalized: normalizeName(parsed.data.name) })
    .select("id")
    .single();

  if (error) return { ok: false, error: "登録に失敗しました" };

  await logAudit({
    userId: user.id,
    action: "person.create",
    entityType: "person",
    entityId: data.id,
    detail: { after: parsed.data },
  });

  revalidatePath("/persons");
  return { ok: true, data: { id: data.id } };
}
```

### Client Component からの呼び出し

```tsx
"use client";
import { useTransition } from "react";
import { createPerson } from "@/server/persons";

export function PersonCreateForm() {
  const [pending, start] = useTransition();
  const onSubmit = (values: PersonUpsertInput) => {
    start(async () => {
      const res = await createPerson(values);
      if (!res.ok) toast.error(res.error);
      else toast.success("登録しました");
    });
  };
  // ... react-hook-form で UI
}
```

---

## 認証

### サインイン（Google Workspace SSO）

```ts
// src/app/(auth)/login/page.tsx の一部
"use client";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: `${window.location.origin}/callback`,
    queryParams: { hd: "n-grust.co.jp" }, // ドメイン制限
  },
});
```

### コールバック（Route Handler）

```ts
// src/app/(auth)/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(`${origin}/`);
}
```

### サインアウト

```ts
// src/server/auth.ts
"use server";
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

### セッション取得

サーバー側では `supabase.auth.getUser()` でセッションを取得。middleware（`src/middleware.ts`）で全リクエスト時にリフレッシュする（`@supabase/ssr` 標準手順）。

---

## 人マスタ（Server Actions）

| 関数 | 機能 | 権限 |
|---|---|---|
| `listPersons(params)` | 一覧・検索 | 全員 |
| `getPerson(id)` | 詳細取得 | 全員 |
| `createPerson(input)` | 新規登録 | 全員 |
| `updatePerson(id, input)` | 更新 | 全員 |
| `deletePerson(id, { force })` | 削除（案件紐付け時は警告） | admin |
| `findDuplicates(query)` | 重複候補検索（pg_trgm） | 全員 |

```ts
// src/server/persons.ts（抜粋）
export type ListPersonsParams = {
  q?: string;
  personType?: "individual" | "corporation";
  page?: number;
  perPage?: number;
};

export async function listPersons(params: ListPersonsParams) {
  await requireActiveUser();
  const supabase = await createClient();
  const page = params.page ?? 1;
  const perPage = Math.min(params.perPage ?? 20, 100);

  let query = supabase.from("persons").select("*", { count: "exact" });
  if (params.q) query = query.or(
    `name.ilike.%${params.q}%,name_kana.ilike.%${params.q}%`,
  );
  if (params.personType) query = query.eq("person_type", params.personType);

  const { data, count, error } = await query
    .order("updated_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (error) return { ok: false, error: "取得に失敗しました" } as const;
  return { ok: true, data: { items: data, total: count ?? 0, page, perPage } } as const;
}
```

---

## 案件（Server Actions）

| 関数 | 機能 | 権限 |
|---|---|---|
| `listCases(params)` | 一覧（期限超過フィルタ含む） | 全員 |
| `getCaseDetail(id)` | 詳細（関係者・土地・金額を含む） | 全員 |
| `createCase(input)` | 新規登録（`next_case_number` で自動採番） | 全員 |
| `updateCase(id, input)` | 基本情報更新 | 全員 |
| `deleteCase(id)` | 削除 | admin |
| `addCasePerson(caseId, input)` | 関係者追加（人マスタからスナップショット取得） | 全員 |
| `updateCasePerson(casePersonId, input)` | 関係者更新（役割・スナップショット手動編集） | 全員 |
| `removeCasePerson(casePersonId)` | 関係者削除 | 全員 |
| `resyncCasePerson(casePersonId)` | マスタ再同期（スナップショット上書き、監査ログ記録） | 全員 |
| `upsertCaseParcels(caseId, parcels[])` | 土地一括更新（差分更新） | 全員 |
| `updateCaseFinancial(caseId, input)` | 金額更新 | 全員 |

### スナップショット取得の実装方針

`addCasePerson` で `person_id` を受け取ったら、その時点の `persons` レコードをコピーして `case_persons.snapshot_*` に書き込む。以降、人マスタが変更されてもこの案件には影響しない。再同期したい場合だけ `resyncCasePerson` を呼ぶ。

---

## テンプレート（Server Actions）

| 関数 | 機能 | 権限 |
|---|---|---|
| `listTemplates(params)` | 一覧（カテゴリ・案件種別フィルタ） | 全員 |
| `getTemplate(id)` | 詳細（マッピング含む） | 全員 |
| `uploadTemplate(formData)` | アップロード（Supabase Storage + DB 登録） | admin |
| `updateTemplateMeta(id, input)` | メタ情報更新 | admin |
| `deactivateTemplate(id)` | 無効化 | admin |
| `upsertMappings(templateId, mappings[])` | マッピング一括更新 | admin |
| `previewTemplateFill(templateId, caseId)` | 転記前チェック（空欄・必須欠落検出） | 全員 |

### アップロードの実装方針

`uploadTemplate` は `FormData` を受け取り、以下を順に行う：

1. `requireAdmin()`
2. zod でメタ情報バリデーション
3. ファイルの拡張子確認（`.docx` / `.xlsx` のみ）。`.doc` / `.xls` は事前変換を促すエラーを返す
4. Supabase Storage の `templates` バケットに保存（パス：`templates/{category_slug}/{temp_id}_v{version}.{ext}`）
5. `templates` テーブルに INSERT（新バージョンならバージョン番号インクリメント）
6. `audit_logs` に `template.upload` を記録
7. `revalidatePath("/templates")`

---

## 帳票生成（Server Action）

```ts
// src/server/documents.ts
"use server";

const GenerateSchema = z.object({
  caseId: z.number().int().positive(),
  templateId: z.number().int().positive(),
  highlight: z.boolean().default(true),
});

export async function generateDocument(input: z.infer<typeof GenerateSchema>) {
  const user = await requireActiveUser();
  const parsed = GenerateSchema.parse(input);
  const supabase = await createClient();

  // 1. 案件データ取得（関係者・土地・金額）
  const caseData = await fetchCaseDetail(parsed.caseId);
  // 2. テンプレートのメタ + マッピング取得
  const template = await fetchTemplateWithMappings(parsed.templateId);
  // 3. Storage からテンプレート本体を Buffer で取得
  const fileBuf = await downloadTemplateBuffer(template.file_path);
  // 4. TransferContext 組み立て
  const ctx = buildTransferContext(caseData);
  // 5. 転記実行（docxtemplater or exceljs）
  const output = template.file_type === "docx"
    ? await fillDocx(fileBuf, ctx, template.mappings, parsed.highlight)
    : await fillXlsx(fileBuf, ctx, template.mappings, parsed.highlight);
  // 6. 新バージョンとして Storage に保存
  const version = await nextDocumentVersion(parsed.caseId, parsed.templateId);
  const fileName = buildFileName(caseData.case_number, template.name, version, template.file_type);
  const filePath = `documents/${caseData.case_number}/${fileName}`;
  await uploadGenerated(filePath, output);
  // 7. document_histories に INSERT
  const history = await insertDocumentHistory({
    caseId: parsed.caseId,
    templateId: parsed.templateId,
    version,
    fileName,
    filePath,
    fileType: template.file_type,
    transferredData: ctx,
    highlightEnabled: parsed.highlight,
    generatedByUserId: user.id,
  });
  // 8. 監査ログ
  await logAudit({
    userId: user.id,
    action: "document.generate",
    entityType: "document",
    entityId: history.id,
    detail: { caseId: parsed.caseId, templateId: parsed.templateId, version },
  });

  return {
    ok: true as const,
    data: {
      id: history.id,
      fileName,
      fileType: template.file_type,
      version,
      downloadUrl: `/api/documents/${history.id}/download`,
    },
  };
}
```

### ダウンロード（Route Handler）

バイナリストリーム配信のため Route Handler を使う：

```ts
// src/app/api/documents/[id]/download/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: history, error } = await supabase
    .from("document_histories")
    .select("*")
    .eq("id", Number(id))
    .single();
  if (error || !history) return new NextResponse("Not Found", { status: 404 });

  const { data: blob, error: dlErr } = await supabase.storage
    .from("documents")
    .download(history.file_path.replace(/^documents\//, ""));
  if (dlErr || !blob) return new NextResponse("Not Found", { status: 404 });

  return new NextResponse(blob, {
    headers: {
      "Content-Type": history.file_type === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(history.file_name)}`,
    },
  });
}
```

### 転記前チェック

`previewTemplateFill(templateId, caseId)`：生成はせず、マッピング定義に対してどのフィールドが埋まるか・必須欠落があるかを返す。

```ts
type PreviewResult = {
  totalFields: number;
  filledFields: number;
  missingRequired: string[];   // label
  missingOptional: string[];
  previewData: Record<string, string>;
};
```

---

## 帳票履歴（Server Actions）

| 関数 | 機能 | 権限 |
|---|---|---|
| `listDocuments(params)` | 履歴一覧（案件・テンプレートでフィルタ） | 全員 |
| `getDocument(id)` | 詳細（transferred_data 含む） | 全員 |

> `document_histories` は RLS で UPDATE / DELETE を禁止している（履歴不変性）。

---

## ダッシュボード（Server Component で直接クエリ）

ダッシュボードは Server Component で Supabase から直接 SELECT する。Server Action は不要。

```ts
// src/app/(dashboard)/page.tsx
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [{ data: summary }, { data: overdue }] = await Promise.all([
    supabase.rpc("dashboard_summary"),       // 集計は DB 関数に寄せる
    supabase.rpc("dashboard_overdue_cases"),
  ]);
  return <DashboardView summary={summary} overdue={overdue} />;
}
```

集計用の DB 関数定義は `phase4/10_dashboard.md` を参照。

---

## 監査ログ（Server Action）

| 関数 | 機能 | 権限 |
|---|---|---|
| `listAuditLogs(params)` | 監査ログ一覧（entity_type, user_id, 期間でフィルタ） | admin |

RLS で admin のみ SELECT 可能。アプリ層でも `requireAdmin()` を呼ぶ二重防衛。

---

## エラーハンドリング方針

- ユーザー向けエラー文は**日本語**で「何が起きたか」＋「どうすればよいか」をセット（CLAUDE.md §4.5）
- 例外で制御フローを作らず `Result<T, E>` 風の戻り値を返す
- バリデーションエラーと権限エラーは区別して UI 表示（フォーム下のインライン vs トースト）
- Supabase のエラーコードは `error.code` と `error.message` をそのまま出さず、業務語彙に変換して返す

---

## 参考：要件 md との対応

| 機能 | 要件 md |
|---|---|
| 人マスタ CRUD | `phase2/05_persons_master.md` |
| 案件 CRUD | `phase2/06_cases_master.md` |
| 転記エンジン | `phase3/07_transfer_engine.md` |
| テンプレート管理 | `phase3/08_template_management.md` |
| 履歴・監査 | `phase3/09_document_history.md` |
| ダッシュボード | `phase4/10_dashboard.md` |
| 認証・権限 | `phase5/11_auth_permissions.md` |
