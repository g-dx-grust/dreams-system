import { NextResponse } from "next/server";
import { logSystemAudit } from "@/lib/audit";
import { requestIpFromHeaders } from "@/lib/request-ip";
import { createClient } from "@/lib/supabase/server";
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
  const next = searchParams.get("next") ?? "/";
  const ipAddress = requestIpFromHeaders(req.headers);

  if (state) {
    return redirectToLarkCallback(req);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data } = await supabase.auth.getUser();
      if (data.user) await syncAuthenticatedUserProfile(data.user);
      await logSystemAudit({
        userId: data.user?.id ?? null,
        action: "auth.login_success",
        entityType: "auth",
        detail: { provider: "lark", email: data.user?.email ?? null },
        ipAddress,
      });
      return NextResponse.redirect(`${origin}${next}`);
    }

    await logSystemAudit({
      userId: null,
      action: "auth.login_failure",
      entityType: "auth",
      detail: { provider: "lark", reason: "exchange_failed" },
      ipAddress,
    });
  } else {
    await logSystemAudit({
      userId: null,
      action: "auth.login_failure",
      entityType: "auth",
      detail: { provider: "lark", reason: "missing_code" },
      ipAddress,
    });
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
