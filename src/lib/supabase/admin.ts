import { createClient } from "@supabase/supabase-js";

/*
 * service_role key を使う管理者クライアント。
 * RLS をバイパスするため、Server Action / Route Handler からのみ使用する。
 * クライアントコンポーネントには絶対に露出させない。
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Supabase admin client: env vars missing");
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
