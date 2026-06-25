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
    const { error } = await admin.from("users").upsert(
      {
        id: input.userId,
        email: input.profile.email,
        full_name: input.profile.fullName,
        avatar_url: input.profile.avatarUrl,
        last_signed_in: now,
        updated_at: now,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.error("[auth] Lark profile sync failed", { userId: input.userId, error });
    }
  } catch (error) {
    console.error("[auth] Lark profile sync unavailable", { userId: input.userId, error });
  }
}
