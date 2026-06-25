import { NextResponse } from "next/server";
import { buildLarkAuthorizationUrl } from "@/lib/lark/oauth";

const STATE_COOKIE = "dreams_lark_oauth_state";
const NEXT_COOKIE = "dreams_lark_oauth_next";
const COOKIE_MAX_AGE_SECONDS = 10 * 60;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/auth/lark",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://app.local");
    if (parsed.origin !== "https://app.local") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function callbackUrl(req: Request): string {
  const origin = new URL(req.url).origin;
  return `${origin}/auth/lark/callback`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = crypto.randomUUID();
  const redirectUri = callbackUrl(req);
  const authUrl = buildLarkAuthorizationUrl({ redirectUri, state });

  if (!authUrl.ok) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("error", "lark_not_configured");
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.redirect(authUrl.data);
  response.cookies.set(STATE_COOKIE, state, cookieOptions());
  response.cookies.set(NEXT_COOKIE, safeNextPath(url.searchParams.get("next")), cookieOptions());
  return response;
}
