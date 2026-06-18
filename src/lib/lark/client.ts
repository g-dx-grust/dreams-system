const DEFAULT_LARK_OPEN_API_BASE_URL = "https://open.larksuite.com";
const TOKEN_EXPIRY_SKEW_MS = 60_000;

export type LarkResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number; code?: number };

type LarkRequestInit = Omit<RequestInit, "headers" | "body"> & {
  body?: unknown;
  query?: URLSearchParams;
};

type TenantAccessTokenData = {
  tenantAccessToken: string;
  expiresInSeconds: number;
};

type CachedTenantToken = {
  token: string;
  expiresAtMs: number;
};

type LarkApiEnvelope<T> = {
  code?: number;
  msg?: string;
  data?: T;
  error?: unknown;
};

let cachedTenantToken: CachedTenantToken | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getLarkOpenApiBaseUrl(): string {
  return optionalEnv("LARK_OPEN_API_BASE_URL") ?? DEFAULT_LARK_OPEN_API_BASE_URL;
}

export function getLarkAppCredentials(): { appId: string; appSecret: string } | null {
  const appId = optionalEnv("LARK_APP_ID");
  const appSecret = optionalEnv("LARK_APP_SECRET");
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

export function isLarkApiConfigured(): boolean {
  return getLarkAppCredentials() !== null;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { code: -1, msg: "Lark APIの応答をJSONとして解釈できませんでした。" };
  }
}

function larkEnvelopeError(value: LarkApiEnvelope<unknown>, fallback: string): string {
  if (typeof value.msg === "string" && value.msg.trim()) return value.msg;
  if (isRecord(value.error)) {
    const message = value.error.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function getTenantAccessToken(): Promise<LarkResult<TenantAccessTokenData>> {
  const now = Date.now();
  if (cachedTenantToken && cachedTenantToken.expiresAtMs - TOKEN_EXPIRY_SKEW_MS > now) {
    return ok({
      tenantAccessToken: cachedTenantToken.token,
      expiresInSeconds: Math.max(0, Math.floor((cachedTenantToken.expiresAtMs - now) / 1000)),
    });
  }

  const credentials = getLarkAppCredentials();
  if (!credentials) {
    return fail("LARK_APP_IDとLARK_APP_SECRETが設定されていません。");
  }

  const response = await fetch(
    `${getLarkOpenApiBaseUrl()}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: credentials.appId,
        app_secret: credentials.appSecret,
      }),
    },
  );
  const json = await parseJsonResponse(response);

  if (!isRecord(json)) {
    return fail("Lark APIのトークン応答が不正です。", response.status);
  }

  const code = typeof json.code === "number" ? json.code : undefined;
  if (!response.ok || code !== 0) {
    return fail(
      larkEnvelopeError(json, "Lark tenant access tokenの取得に失敗しました。"),
      response.status,
      code,
    );
  }

  const token = typeof json.tenant_access_token === "string" ? json.tenant_access_token : null;
  const expire = typeof json.expire === "number" ? json.expire : 7200;
  if (!token) return fail("Lark tenant access tokenの応答にtokenが含まれていません。");

  cachedTenantToken = { token, expiresAtMs: now + expire * 1000 };
  return ok({ tenantAccessToken: token, expiresInSeconds: expire });
}

async function requestLarkWithToken<T>(
  path: string,
  accessToken: string,
  init: LarkRequestInit = {},
): Promise<LarkResult<T>> {
  const url = new URL(`${getLarkOpenApiBaseUrl()}${path}`);
  init.query?.forEach((value, key) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: init.body == null ? undefined : JSON.stringify(init.body),
  });
  const json = await parseJsonResponse(response);

  if (!isRecord(json)) {
    return fail("Lark APIの応答が不正です。", response.status);
  }

  const envelope = json as LarkApiEnvelope<T>;
  const code = typeof envelope.code === "number" ? envelope.code : undefined;
  if (!response.ok || code !== 0) {
    return fail(
      larkEnvelopeError(envelope, "Lark APIリクエストに失敗しました。"),
      response.status,
      code,
    );
  }

  return ok((envelope.data ?? {}) as T);
}

export async function requestLarkWithTenantToken<T>(
  path: string,
  init: LarkRequestInit = {},
): Promise<LarkResult<T>> {
  const token = await getTenantAccessToken();
  if (!token.ok) return token;

  return requestLarkWithToken<T>(path, token.data.tenantAccessToken, init);
}

export function ok<T>(data: T): LarkResult<T> {
  return { ok: true, data };
}

export function fail(error: string, status?: number, code?: number): LarkResult<never> {
  return { ok: false, error, status, code };
}
