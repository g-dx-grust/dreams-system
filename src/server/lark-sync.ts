"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { listLarkTenantUsers, type LarkTenantUser } from "@/lib/lark/tenant";
import { type ActionResult, ok, fail } from "@/lib/result";

export type LarkSyncSummary = {
  total: number;
  created: number;
  updated: number;
  deactivated: number;
  failed: number;
  errors: string[];
};

type ExistingUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  lark_open_id: string | null;
  lark_union_id: string | null;
};

const SYNC_CHUNK_SIZE = 5;
const MAX_ERROR_MESSAGES = 5;

function fallbackEmail(openId: string): string {
  return `lark-${openId.toLowerCase()}@lark.local`;
}

async function applyLarkUser(
  admin: ReturnType<typeof createAdminClient>,
  larkUser: LarkTenantUser,
  existing: ExistingUserRow | undefined,
  syncedAt: string,
): Promise<"created" | "updated" | "deactivated" | "skipped"> {
  if (existing) {
    const shouldDeactivate = larkUser.isResigned && existing.is_active;
    const { error } = await admin
      .from("users")
      .update({
        full_name: larkUser.name ?? existing.full_name,
        avatar_url: larkUser.avatarUrl ?? existing.avatar_url,
        lark_open_id: larkUser.openId,
        lark_union_id: larkUser.unionId ?? existing.lark_union_id,
        lark_synced_at: syncedAt,
        updated_at: syncedAt,
        // 退職・凍結済みは無効化する。有効化は管理者の明示操作のみとする。
        ...(shouldDeactivate ? { is_active: false } : {}),
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return shouldDeactivate ? "deactivated" : "updated";
  }

  if (larkUser.isResigned) return "skipped";

  const email = larkUser.email ?? fallbackEmail(larkUser.openId);
  const createdUser = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: larkUser.name,
      avatar_url: larkUser.avatarUrl,
      lark_open_id: larkUser.openId,
      lark_union_id: larkUser.unionId,
    },
  });
  if (createdUser.error || !createdUser.data.user) {
    throw new Error(createdUser.error?.message ?? "認証ユーザーの作成に失敗しました");
  }

  const { error } = await admin.from("users").upsert(
    {
      id: createdUser.data.user.id,
      email,
      full_name: larkUser.name,
      avatar_url: larkUser.avatarUrl,
      role: "user",
      is_active: true,
      lark_open_id: larkUser.openId,
      lark_union_id: larkUser.unionId,
      lark_synced_at: syncedAt,
      updated_at: syncedAt,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
  return "created";
}

/*
 * Larkテナントの全メンバーをusersへ反映する。
 * 招待メール運用を置き換えるもので、同期後はLarkログインだけで利用開始できる。
 */
export async function syncUsersFromLark(): Promise<ActionResult<LarkSyncSummary>> {
  const actor = await requireAdmin();

  const larkUsers = await listLarkTenantUsers();
  if (!larkUsers.ok) return fail(larkUsers.error);
  if (larkUsers.data.length === 0) {
    return fail(
      "Larkテナントからメンバーを取得できませんでした。アプリの公開範囲（可用性設定）を確認してください。",
    );
  }

  const admin = createAdminClient();
  const { data: existingRows, error: existingError } = await admin
    .from("users")
    .select("id, email, full_name, avatar_url, is_active, lark_open_id, lark_union_id");
  if (existingError) return fail("既存ユーザーの取得に失敗しました。時間をおいて再実行してください。");

  const rows = (existingRows ?? []) as ExistingUserRow[];
  const byOpenId = new Map(rows.filter((r) => r.lark_open_id).map((r) => [r.lark_open_id!, r]));
  const byEmail = new Map(rows.map((r) => [r.email.toLowerCase(), r]));

  const summary: LarkSyncSummary = {
    total: larkUsers.data.length,
    created: 0,
    updated: 0,
    deactivated: 0,
    failed: 0,
    errors: [],
  };
  const syncedAt = new Date().toISOString();

  for (let i = 0; i < larkUsers.data.length; i += SYNC_CHUNK_SIZE) {
    const chunk = larkUsers.data.slice(i, i + SYNC_CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (larkUser) => {
        const existing =
          byOpenId.get(larkUser.openId) ??
          (larkUser.email ? byEmail.get(larkUser.email) : undefined);
        try {
          const outcome = await applyLarkUser(admin, larkUser, existing, syncedAt);
          if (outcome === "created") summary.created += 1;
          else if (outcome === "updated") summary.updated += 1;
          else if (outcome === "deactivated") summary.deactivated += 1;
        } catch (error) {
          summary.failed += 1;
          if (summary.errors.length < MAX_ERROR_MESSAGES) {
            const message = error instanceof Error ? error.message : String(error);
            summary.errors.push(`${larkUser.name ?? larkUser.openId}: ${message}`);
          }
        }
      }),
    );
  }

  await logAudit({
    userId: actor.id,
    action: "user.lark_sync",
    entityType: "user",
    detail: {
      total: summary.total,
      created: summary.created,
      updated: summary.updated,
      deactivated: summary.deactivated,
      failed: summary.failed,
    },
  });

  revalidatePath("/users");
  return ok(summary);
}
