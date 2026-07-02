import {
  fail,
  getLarkAppCredentials,
  getLarkAuthBaseUrl,
  getLarkOpenApiBaseUrl,
  ok,
  type LarkResult,
} from "@/lib/lark/client";

const DEFAULT_LOGIN_SCOPE = "contact:user.base:readonly contact:user.email:readonly";

export type LarkOAuthUserProfile = {
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  openId: string | null;
  unionId: string | null;
};

type OAuthTokenPayload = {
  accessToken: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function numberCode(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { code: -1, msg: "Lark APIの応答をJSONとして解釈できませんでした。" };
  }
}

function envelopeData(value: JsonRecord): JsonRecord {
  return isRecord(value.data) ? value.data : value;
}

function envelopeMessage(value: JsonRecord, fallback: string): string {
  return textValue(value.msg) ?? textValue(value.message) ?? fallback;
}

function isEnvelopeSuccess(value: JsonRecord, response: Response): boolean {
  const code = numberCode(value.code);
  return response.ok && (code === null || code === 0);
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function firstText(records: JsonRecord[], keys: string[]): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = textValue(record[key]);
      if (value) return value;
    }
  }
  return null;
}

export function larkLoginScope(): string {
  return process.env.LARK_LOGIN_SCOPE?.trim() || DEFAULT_LOGIN_SCOPE;
}

export function buildLarkAuthorizationUrl(input: {
  redirectUri: string;
  state: string;
}): LarkResult<string> {
  const credentials = getLarkAppCredentials();
  if (!credentials) return fail("LARK_APP_IDとLARK_APP_SECRETが設定されていません。");

  const url = new URL(`${getLarkAuthBaseUrl()}/open-apis/authen/v1/authorize`);
  url.searchParams.set("client_id", credentials.appId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);

  const scope = larkLoginScope();
  if (scope) url.searchParams.set("scope", scope);

  return ok(url.toString());
}

export async function exchangeLarkCode(input: {
  code: string;
  redirectUri: string;
}): Promise<LarkResult<OAuthTokenPayload>> {
  const credentials = getLarkAppCredentials();
  if (!credentials) return fail("LARK_APP_IDとLARK_APP_SECRETが設定されていません。");

  const response = await fetch(`${getLarkOpenApiBaseUrl()}/open-apis/authen/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: credentials.appId,
      client_secret: credentials.appSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }),
  });
  const json = await parseJson(response);
  if (!isRecord(json)) return fail("Lark OAuth token応答が不正です。", response.status);
  if (!isEnvelopeSuccess(json, response)) {
    return fail(envelopeMessage(json, "Lark OAuth tokenの取得に失敗しました。"), response.status);
  }

  const data = envelopeData(json);
  const accessToken = textValue(data.access_token);
  if (!accessToken) return fail("Lark OAuth token応答にaccess_tokenが含まれていません。");

  return ok({ accessToken });
}

export async function getLarkOAuthUserProfile(
  accessToken: string,
): Promise<LarkResult<LarkOAuthUserProfile>> {
  const response = await fetch(`${getLarkOpenApiBaseUrl()}/open-apis/authen/v1/user_info`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
  const json = await parseJson(response);
  if (!isRecord(json)) return fail("Larkユーザー情報の応答が不正です。", response.status);
  if (!isEnvelopeSuccess(json, response)) {
    return fail(envelopeMessage(json, "Larkユーザー情報の取得に失敗しました。"), response.status);
  }

  const data = envelopeData(json);
  const nestedUser = isRecord(data.user) ? data.user : null;
  const nestedUserInfo = isRecord(data.user_info) ? data.user_info : null;
  const records = [
    data,
    ...(nestedUser ? [nestedUser] : []),
    ...(nestedUserInfo ? [nestedUserInfo] : []),
  ];

  const email = firstText(records, ["email", "enterprise_email", "user_email", "mail"]);
  const openId = firstText(records, ["open_id", "openId"]);
  if (!email && !openId) {
    return fail(
      "Larkアカウントを識別できませんでした。Larkアプリのユーザー情報取得権限を確認してください。",
    );
  }

  return ok({
    email: email?.toLowerCase() ?? null,
    fullName: firstText(records, ["name", "full_name", "display_name", "en_name"]),
    avatarUrl: safeHttpUrl(
      firstText(records, ["avatar_url", "avatar", "avatar_thumb", "avatar_middle", "avatar_big"]),
    ),
    openId,
    unionId: firstText(records, ["union_id", "unionId"]),
  });
}
