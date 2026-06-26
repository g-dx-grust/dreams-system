import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logSystemAudit } from "@/lib/audit";
import { requestIpFromHeaders } from "@/lib/request-ip";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeLarkCode, getLarkOAuthUserProfile } from "@/lib/lark/oauth";
import { safeRedirectPath } from "@/lib/security/redirect";
import { syncLarkAuthenticatedUserProfile } from "@/server/auth-profile";

const STATE_COOKIE = "dreams_lark_oauth_state";
const NEXT_COOKIE = "dreams_lark_oauth_next";

function expiredCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/auth/lark",
    maxAge: 0,
  };
}

function callbackUrl(req: Request): string {
  const origin = new URL(req.url).origin;
  return `${origin}/auth/lark/callback`;
}

function redirectAndClear(req: Request, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, req.url));
  response.cookies.set(STATE_COOKIE, "", expiredCookieOptions());
  response.cookies.set(NEXT_COOKIE, "", expiredCookieOptions());
  return response;
}

async function logFailure(req: Request, reason: string, detail: Record<string, unknown> = {}) {
  await logSystemAudit({
    userId: null,
    action: "auth.login_failure",
    entityType: "auth",
    detail: { provider: "lark", reason, ...detail },
    ipAddress: requestIpFromHeaders(req.headers),
  });
}

async function findRegisteredActiveUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
) {
  return await admin
    .from("users")
    .select("id, email, is_active")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  const nextFromCookie = cookieStore.get(NEXT_COOKIE)?.value;

  if (error) {
    await logFailure(req, "provider_error", { error });
    return redirectAndClear(req, "/login?error=lark_provider_error");
  }

  if (!code) {
    await logFailure(req, "missing_code");
    return redirectAndClear(req, "/login?error=lark_missing_code");
  }

  if (!state || !expectedState || expectedState !== state) {
    await logFailure(req, "invalid_state");
    return redirectAndClear(req, "/login?error=lark_invalid_state");
  }

  const token = await exchangeLarkCode({ code, redirectUri: callbackUrl(req) });
  if (!token.ok) {
    await logFailure(req, "token_exchange_failed", { message: token.error, status: token.status });
    return redirectAndClear(req, "/login?error=lark_token_failed");
  }

  const larkProfile = await getLarkOAuthUserProfile(token.data.accessToken);
  if (!larkProfile.ok) {
    await logFailure(req, "profile_fetch_failed", { message: larkProfile.error });
    return redirectAndClear(req, "/login?error=lark_profile_failed");
  }

  const metadata = {
    full_name: larkProfile.data.fullName,
    avatar_url: larkProfile.data.avatarUrl,
    lark_open_id: larkProfile.data.openId,
    lark_union_id: larkProfile.data.unionId,
  };

  const admin = createAdminClient();
  const registeredUser = await findRegisteredActiveUser(admin, larkProfile.data.email);
  if (registeredUser.error || !registeredUser.data) {
    await logFailure(req, registeredUser.error ? "profile_lookup_failed" : "unregistered_user", {
      email: larkProfile.data.email,
      message: registeredUser.error?.message,
    });
    return redirectAndClear(req, "/login?error=unregistered_user");
  }

  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: larkProfile.data.email,
    options: { data: metadata },
  });

  const tokenHash = link.data.properties?.hashed_token;
  if (link.error || !tokenHash) {
    await logFailure(req, "supabase_link_failed", {
      email: larkProfile.data.email,
      message: link.error?.message,
    });
    return redirectAndClear(req, "/login?error=auth_callback_failed");
  }

  const supabase = await createClient();
  const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (verified.error || !verified.data.user) {
    await logFailure(req, "supabase_verify_failed", {
      email: larkProfile.data.email,
      message: verified.error?.message,
    });
    return redirectAndClear(req, "/login?error=auth_callback_failed");
  }

  if (verified.data.user.id !== registeredUser.data.id) {
    await supabase.auth.signOut();
    await logFailure(req, "user_id_mismatch", { email: larkProfile.data.email });
    return redirectAndClear(req, "/login?error=auth_callback_failed");
  }

  await syncLarkAuthenticatedUserProfile({
    userId: verified.data.user.id,
    profile: larkProfile.data,
  });

  const { data: appUser } = await admin
    .from("users")
    .select("is_active")
    .eq("id", verified.data.user.id)
    .single();

  if (!appUser?.is_active) {
    await supabase.auth.signOut();
    await logFailure(req, "inactive_user", { email: larkProfile.data.email });
    return redirectAndClear(req, "/login?error=inactive_user");
  }

  await logSystemAudit({
    userId: verified.data.user.id,
    action: "auth.login_success",
    entityType: "auth",
    detail: {
      provider: "lark",
      email: larkProfile.data.email,
      lark_open_id: larkProfile.data.openId,
    },
    ipAddress: requestIpFromHeaders(req.headers),
  });

  return redirectAndClear(req, safeRedirectPath(nextFromCookie));
}
