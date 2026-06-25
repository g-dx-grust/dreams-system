"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logSystemAudit } from "@/lib/audit";
import { requestIpFromHeaders } from "@/lib/request-ip";
import { fail, ok, type ActionResult } from "@/lib/result";

const EmailSignInSchema = z.object({
  email: z.string().trim().email("メールアドレスの形式が正しくありません。"),
  password: z.string().min(1, "パスワードを入力してください。"),
});

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function signInWithEmailPassword(input: {
  email: string;
  password: string;
}): Promise<ActionResult<{ userId: string }>> {
  const parsed = EmailSignInSchema.safeParse(input);
  const headerList = await headers();
  const ipAddress = requestIpFromHeaders(headerList);
  const email = parsed.success ? parsed.data.email.toLowerCase() : input.email.trim().toLowerCase();

  if (!parsed.success) {
    await logSystemAudit({
      userId: null,
      action: "auth.login_failure",
      entityType: "auth",
      detail: { email, reason: "validation_failed" },
      ipAddress,
    });
    const first = parsed.error.issues[0];
    return fail(first?.message ?? "ログイン情報を確認してください。", first?.path.join("."));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    await logSystemAudit({
      userId: null,
      action: "auth.login_failure",
      entityType: "auth",
      detail: { email, reason: "invalid_credentials" },
      ipAddress,
    });
    return fail("メールアドレスまたはパスワードが正しくありません。");
  }

  await logSystemAudit({
    userId: data.user.id,
    action: "auth.login_success",
    entityType: "auth",
    detail: { email },
    ipAddress,
  });

  return ok({ userId: data.user.id });
}
