import { NextResponse } from "next/server";
import { logSystemAudit } from "@/lib/audit";
import { requestIpFromHeaders } from "@/lib/request-ip";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/security/redirect";
import { syncAuthenticatedUserProfile } from "@/server/auth-profile";

function redirectToLarkCallback(req: Request): NextResponse {
  const url = new URL(req.url);
  const larkCallbackUrl = new URL("/auth/lark/callback", url.origin);
  larkCallbackUrl.search = url.search;
  return NextResponse.redirect(larkCallbackUrl);
}

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const next = safeRedirectPath(searchParams.get("next"));
  const ipAddress = requestIpFromHeaders(req.headers);

  if (state) {
    return redirectToLarkCallback(req);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        await logSystemAudit({
          userId: null,
          action: "auth.login_failure",
          entityType: "auth",
          detail: { provider: "supabase", reason: "missing_user" },
          ipAddress,
        });
        return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
      }

      const { data: appUser } = await supabase
        .from("users")
        .select("is_active")
        .eq("id", data.user.id)
        .single();
      if (!appUser?.is_active) {
        await supabase.auth.signOut();
        await logSystemAudit({
          userId: data.user.id,
          action: "auth.login_failure",
          entityType: "auth",
          detail: { provider: "supabase", reason: "inactive_user" },
          ipAddress,
        });
        return NextResponse.redirect(`${origin}/login?error=inactive_user`);
      }

      await syncAuthenticatedUserProfile(data.user);
      await logSystemAudit({
        userId: data.user.id,
        action: "auth.login_success",
        entityType: "auth",
        detail: { provider: "supabase", email: data.user.email ?? null },
        ipAddress,
      });
      return NextResponse.redirect(new URL(next, origin));
    }

    await logSystemAudit({
      userId: null,
      action: "auth.login_failure",
      entityType: "auth",
      detail: { provider: "supabase", reason: "exchange_failed" },
      ipAddress,
    });
  } else {
    await logSystemAudit({
      userId: null,
      action: "auth.login_failure",
      entityType: "auth",
      detail: { provider: "supabase", reason: "missing_code" },
      ipAddress,
    });
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
