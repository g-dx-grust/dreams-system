import type { User } from "@supabase/supabase-js";
import { extractAuthUserProfile } from "@/lib/auth/user-profile";
import type { LarkOAuthUserProfile } from "@/lib/lark/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

type UserProfileUpsert = {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  last_signed_in: string;
  updated_at: string;
};

export async function syncAuthenticatedUserProfile(user: User): Promise<void> {
  const profile = extractAuthUserProfile(user);
  if (!profile.email) {
    console.warn("[auth] profile sync skipped: email is missing", { userId: user.id });
    return;
  }

  const now = new Date().toISOString();
  const row: UserProfileUpsert = {
    id: user.id,
    email: profile.email,
    last_signed_in: now,
    updated_at: now,
  };

  if (profile.fullName) row.full_name = profile.fullName;
  if (profile.avatarUrl) row.avatar_url = profile.avatarUrl;

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("users").upsert(row, { onConflict: "id" });
    if (error) {
      console.error("[auth] profile sync failed", { userId: user.id, error });
    }
  } catch (error) {
    console.error("[auth] profile sync unavailable", { userId: user.id, error });
  }
}

export async function syncLarkAuthenticatedUserProfile(input: {
  userId: string;
  profile: LarkOAuthUserProfile;
}): Promise<void> {
  const now = new Date().toISOString();

  try {
    const admin = createAdminClient();
    // emailはauth.usersとの一致が前提（マジックリンク生成に使用）のため、ここでは更新しない
    const { error } = await admin
      .from("users")
      .update({
        ...(input.profile.fullName ? { full_name: input.profile.fullName } : {}),
        ...(input.profile.avatarUrl ? { avatar_url: input.profile.avatarUrl } : {}),
        ...(input.profile.openId ? { lark_open_id: input.profile.openId } : {}),
        ...(input.profile.unionId ? { lark_union_id: input.profile.unionId } : {}),
        last_signed_in: now,
        updated_at: now,
      })
      .eq("id", input.userId);
    if (error) {
      console.error("[auth] Lark profile sync failed", { userId: input.userId, error });
    }
  } catch (error) {
    console.error("[auth] Lark profile sync unavailable", { userId: input.userId, error });
  }
}
