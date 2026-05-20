// 開発用テストユーザーを Supabase に作成するスクリプト
// 使い方: node scripts/create-dev-user.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(".env.local の NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = "dev@n-grust.co.jp";
const PASSWORD = "DreaMs2026!";

console.log("ユーザーを作成しています...");

const { data, error } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: "開発管理者" },
});

if (error) {
  if (error.message?.includes("already registered") || error.message?.includes("already been registered")) {
    console.log("ユーザーは既に存在します。ロールを admin に設定します。");
    // 既存ユーザーのIDを取得
    const { data: listData } = await admin.auth.admin.listUsers();
    const existing = listData?.users?.find(u => u.email === EMAIL);
    if (existing) {
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(existing.id, {
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { ...(existing.user_metadata ?? {}), full_name: "開発管理者" },
      });

      if (authUpdateError) {
        console.warn("Auth ユーザー更新エラー:", authUpdateError.message);
      }

      await admin.from("users").update({ role: "admin", full_name: "開発管理者" }).eq("id", existing.id);
      console.log("\n✅ 設定完了");
      console.log("----------------------------");
      console.log("メールアドレス:", EMAIL);
      console.log("パスワード:    ", PASSWORD);
      console.log("----------------------------");
    }
  } else {
    console.error("エラー:", error.message);
    process.exit(1);
  }
} else {
  // トリガーが public.users にレコードを挿入するまで少し待つ
  await new Promise(r => setTimeout(r, 800));

  const { error: updateError } = await admin
    .from("users")
    .update({ role: "admin", full_name: "開発管理者" })
    .eq("id", data.user.id);

  if (updateError) {
    console.warn("ロール設定エラー:", updateError.message);
  }

  console.log("\n✅ ユーザー作成完了");
  console.log("----------------------------");
  console.log("メールアドレス:", EMAIL);
  console.log("パスワード:    ", PASSWORD);
  console.log("----------------------------");
  console.log("アクセス先:", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
}
