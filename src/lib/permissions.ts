import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "user";

export type AppUser = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: AppRole;
  isActive: boolean;
};

/*
 * 現在の認証ユーザーと public.users のレコードを解決する。
 * 未認証・無効アカウントの場合は null を返す。
 */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, avatar_url, role, is_active")
    .eq("id", user.id)
    .single();

  if (error || !data || !data.is_active) return null;

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    avatarUrl: data.avatar_url,
    role: data.role as AppRole,
    isActive: data.is_active,
  };
});

export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("認証が必要です");
  return user;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new PermissionError("この操作には管理者権限が必要です");
  return user;
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}
