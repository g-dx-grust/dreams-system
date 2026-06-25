# Phase 5-1: 認証・権限管理仕様

## 認証方式

**Supabase Auth** を採用する。独自 JWT（python-jose）、独自パスワードハッシュ、独自セッション管理は**一切実装しない**。

- **プロバイダ**：Lark SSO（第一選択、Next.js Route Handler で Lark OAuth code を直接処理）
- **メール + パスワード**：バックアップ手段として有効化（初期管理者や SSO 未付与ユーザー用）
- **セッション**：Supabase が発行する JWT を Cookie ベースで保持（`@supabase/ssr` を使用）
- **有効期限**：Supabase Auth のデフォルト（アクセストークン 1 時間、リフレッシュトークン 自動）
- **パスワードハッシュ**：Supabase 側（bcrypt 同等）

Lark 側ではカスタムアプリを作成し、Vercel 環境変数の `LARK_APP_ID` / `LARK_APP_SECRET` で code 交換を行う。Supabase Auth の Custom OAuth/OIDC Provider は使わない。Lark Developer のリダイレクト URL には `https://<app-domain>/auth/lark/callback` を登録する。プロフィール画像は Lark の user_info から `public.users.avatar_url` に同期し、未取得時は UI 側で頭文字表示にフォールバックする。

---

## ロール定義

| ロール       | コード  | 説明                                           |
| ------------ | ------- | ---------------------------------------------- |
| 管理者       | `admin` | 全機能にアクセス可能                           |
| 一般ユーザー | `user`  | 案件・人マスタの参照・編集可能、管理機能は不可 |

ロールは `public.users.role` カラムで管理する（`auth.users` 側では持たない）。

---

## 権限マトリクス

| 機能                       | 管理者 | 一般ユーザー |
| -------------------------- | ------ | ------------ |
| 案件一覧・詳細表示         | ○      | ○            |
| 案件作成・編集             | ○      | ○            |
| 案件削除                   | ○      | ×            |
| 人マスタ一覧・詳細表示     | ○      | ○            |
| 人マスタ作成・編集         | ○      | ○            |
| 人マスタ削除               | ○      | ×            |
| 帳票生成                   | ○      | ○            |
| 帳票ダウンロード           | ○      | ○            |
| テンプレートアップロード   | ○      | ×            |
| テンプレートマッピング設定 | ○      | ×            |
| テンプレート無効化         | ○      | ×            |
| ユーザー管理               | ○      | ×            |
| 監査ログ閲覧               | ○      | ×            |
| ダッシュボード閲覧         | ○      | ○            |

この権限は **DB の RLS**（`02_db_schema.md` の「RLS ポリシー」参照）と **アプリ層のガード関数**（下記 `requireAdmin()` など）の二重で担保する。

---

## アプリ層のガード関数

```ts
// src/lib/permissions.ts
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type AppUser = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: "admin" | "user";
  isActive: boolean;
};

export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, full_name, avatar_url, role, is_active")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.is_active) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name ?? "",
    avatarUrl: profile.avatar_url,
    role: profile.role as "admin" | "user",
    isActive: profile.is_active,
  };
}

export async function requireActiveUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireActiveUser();
  if (user.role !== "admin") {
    throw new PermissionError("この操作には管理者権限が必要です");
  }
  return user;
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}
```

Server Action / Route Handler の冒頭で必ずどちらかを呼ぶ。

```ts
// src/server/cases.ts
"use server";
export async function deleteCase(id: number) {
  const user = await requireAdmin(); // ← 権限ガード
  // ...
}
```

---

## ミドルウェア（セッション同期）

`@supabase/ssr` 標準手順に従い、ミドルウェアで全リクエスト時にセッションをリフレッシュする。

```ts
// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 未認証かつ保護ルートなら /login に飛ばす
  const path = req.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico";
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!api/documents/[^/]+/download).*)"], // 帳票 DL は別途 Route 内で認証チェック
};
```

---

## ログイン画面

```tsx
// src/app/(auth)/login/page.tsx
"use client";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const signInWithLark = async () => {
    window.location.assign(`${window.location.origin}/auth/lark/start`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-grey-6 px-m py-xl">
      <main className="w-full max-w-[400px] rounded-m border border-border bg-white shadow-s">
        <div className="border-b border-border bg-grey-5 px-l py-m">
          <h1 className="text-l font-semibold text-text-black">案件管理・帳票転記システム</h1>
          <p className="mt-s text-s text-text-grey">
            Larkアカウント、または登録済みのメールアドレスでログインしてください。
          </p>
        </div>
        <div className="px-l py-m">
          <Button className="w-full" onClick={signInWithLark}>
            Larkでログインする
          </Button>
        </div>
      </main>
    </div>
  );
}
```

### メールログイン

Lark SSO を第一選択にする。メール + パスワードはバックアップ手段として残し、`NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=false` の場合は本番 UI から非表示にする。

---

## 初期管理者の作成

1. Supabase Dashboard → Authentication → Users → 「Add user」で自分のメールを追加
2. `handle_new_user` トリガが自動で `public.users` にレコードを作る
3. SQL で `role = 'admin'` に更新：
   ```sql
   UPDATE public.users SET role = 'admin' WHERE email = 'shoji@n-grust.co.jp';
   ```
4. 以降、管理者 UI からユーザー追加・ロール変更が可能

---

## ユーザー管理画面（管理者のみ）

**ルート**：`/users`（admin 専用、middleware + Server Action でガード）

**機能：**

- ユーザー一覧表示（`public.users` と `auth.users` を結合表示）
- 新規ユーザー招待（Supabase Admin API 経由でメール招待）
- ロール変更（`user` / `admin`）
- アカウント有効化 / 無効化（`is_active` トグル）

> **パスワードリセット**：Supabase Auth 標準機能（「パスワードを忘れた」リンクから自動送信）を使う。管理者が直接パスワードを設定する機能は実装しない。

### ユーザー招待の実装

```ts
// src/server/users.ts
"use server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function inviteUser(input: {
  email: string;
  fullName: string;
  role: "admin" | "user";
}) {
  await requireAdmin();
  const admin = createAdminClient(); // service_role キーを使用

  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { full_name: input.fullName },
  });
  if (error) return { ok: false, error: "招待メールの送信に失敗しました" } as const;

  // handle_new_user トリガで public.users が作られた後、role を設定
  await admin
    .from("users")
    .update({ role: input.role, full_name: input.fullName })
    .eq("id", data.user.id);

  await logAudit({
    userId: (await getCurrentUser())!.id,
    action: "user.invite",
    entityType: "user",
    entityId: data.user.id,
    detail: { email: input.email, role: input.role },
  });
  return { ok: true, data: { id: data.user.id } } as const;
}
```

---

## 監査ログ

認証・権限関連で記録するイベント：

| アクション                      | 発生場所                                           | 詳細                          |
| ------------------------------- | -------------------------------------------------- | ----------------------------- |
| `auth.login_success`            | メールログイン Server Action / Lark OAuth callback | ユーザー ID、IP               |
| `auth.login_failure`            | メールログイン Server Action / Lark OAuth callback | メール、IP、失敗理由          |
| `user.invite`                   | `inviteUser` Server Action                         | email, role                   |
| `user.role_change`              | `updateUserRole` Server Action                     | before/after                  |
| `user.deactivate`               | `deactivateUser` Server Action                     | userId                        |
| `person.resync`                 | `resyncCasePerson`                                 | case_person_id, before/after  |
| `template.upload`               | `uploadTemplate`                                   | template_id, version          |
| `document.generate`             | `generateDocument`                                 | case_id, template_id, version |
| `case.delete` / `person.delete` | 各削除 Server Action                               | before                        |

ログイン成功・失敗はアプリ側の `audit_logs` に記録する。失敗時は `user_id = null` とし、パスワードや認証コードは保存しない。Supabase Auth Logs は補助的な確認先として扱う。

---

## 社内アクセス制限（未確定）

クラウド環境でも「社内からしかログインできない」ようにする案（ユーザー決定待ち）：

| 案                                                               | 実装                                                                    | メリット                   | デメリット                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------- | ----------------------------- |
| Cloudflare Access                                                | Vercel の前段に Cloudflare を置き、Access ポリシーで IP / Identity 制限 | きめ細かい制御、Zero Trust | Cloudflare 契約要             |
| Vercel の「Deployment Protection」+ Vercel Firewall ルール       | Vercel 標準機能で IP 制限                                               | 追加契約不要               | Enterprise プラン必要な機能も |
| Supabase Auth の許可ドメイン + Google Workspace 条件付きアクセス | SSO 側で IP 制限                                                        | シンプル                   | Google Workspace 側で設定必要 |

**現状：未実装。Phase 5 中に方針決定後に追加する。**
