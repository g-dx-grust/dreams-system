"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { type ActionResult, ok, fail } from "@/lib/result";

export type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "user";
  is_active: boolean;
  created_at: string;
  last_signed_in: string | null;
};

export type ListUsersInput = {
  q?: string;
  role?: string;
  active?: string;
  sort?: string;
  order?: string;
};

const InviteSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  fullName: z.string().min(1, "氏名を入力してください").max(100),
  role: z.enum(["admin", "user"]),
});

const RoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "user"]),
});

export async function listUsers(
  input: ListUsersInput = {},
): Promise<ActionResult<UserRow[]>> {
  await requireAdmin();
  const supabase = await createClient();

  // 並べ替え可能なカラムは whitelist 化（インジェクション防止）。
  // キーは UI が渡すソートキー、値は実カラム名。
  const sortableColumns: Record<string, string> = {
    full_name: "full_name",
    email: "email",
    role: "role",
    is_active: "is_active",
    created_at: "created_at",
    last_signed_in: "last_signed_in",
  };
  const sortColumn = input.sort ? sortableColumns[input.sort] : undefined;
  const ascending = input.order === "asc";

  let query = supabase
    .from("users")
    .select("id, email, full_name, role, is_active, created_at, last_signed_in");

  const keyword = input.q?.trim();
  if (keyword) {
    const escaped = keyword.replace(/[%,]/g, (m) => `\\${m}`);
    query = query.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%`);
  }
  if (input.role === "admin" || input.role === "user") {
    query = query.eq("role", input.role);
  }
  if (input.active === "active") query = query.eq("is_active", true);
  else if (input.active === "inactive") query = query.eq("is_active", false);

  // 未指定時の既定順は従来どおり作成日の降順を維持する。
  if (sortColumn) query = query.order(sortColumn, { ascending });
  else query = query.order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) return fail("ユーザー一覧の取得に失敗しました");
  return ok(data as UserRow[]);
}

export async function inviteUser(raw: {
  email: string;
  fullName: string;
  role: "admin" | "user";
}): Promise<ActionResult<{ id: string }>> {
  const actor = await requireAdmin();
  const parsed = InviteSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.errors[0]?.message ?? "入力が不正です");

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { full_name: parsed.data.fullName },
  });
  if (error || !data.user) return fail("招待メールの送信に失敗しました");

  // handle_new_user トリガで public.users が作られた後、role と full_name を設定する
  await admin
    .from("users")
    .update({ role: parsed.data.role, full_name: parsed.data.fullName })
    .eq("id", data.user.id);

  await logAudit({
    userId: actor.id,
    action: "user.invite",
    entityType: "user",
    detail: { email: parsed.data.email, role: parsed.data.role },
  });

  revalidatePath("/users");
  return ok({ id: data.user.id });
}

export async function updateUserRole(raw: {
  userId: string;
  role: "admin" | "user";
}): Promise<ActionResult<void>> {
  const actor = await requireAdmin();
  const parsed = RoleSchema.safeParse(raw);
  if (!parsed.success) return fail("入力が不正です");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("users")
    .select("role")
    .eq("id", parsed.data.userId)
    .single();

  const { error } = await supabase
    .from("users")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.userId);

  if (error) return fail("ロールの変更に失敗しました");

  await logAudit({
    userId: actor.id,
    action: "user.role_change",
    entityType: "user",
    detail: { target_user_id: parsed.data.userId, before: current?.role, after: parsed.data.role },
  });

  revalidatePath("/users");
  return ok(undefined);
}

export async function setUserActive(
  userId: string,
  isActive: boolean,
): Promise<ActionResult<void>> {
  const actor = await requireAdmin();
  if (!userId) return fail("ユーザーIDが不正です");

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ is_active: isActive })
    .eq("id", userId);

  if (error) return fail("アカウント状態の変更に失敗しました");

  await logAudit({
    userId: actor.id,
    action: isActive ? "user.activate" : "user.deactivate",
    entityType: "user",
    detail: { target_user_id: userId },
  });

  revalidatePath("/users");
  return ok(undefined);
}
