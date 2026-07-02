import {
  fail,
  getLarkAppCredentials,
  getLarkOpenApiBaseUrl,
  ok,
  type LarkResult,
} from "@/lib/lark/client";

export type LarkTenantUser = {
  openId: string;
  unionId: string | null;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  isResigned: boolean;
};

type JsonRecord = Record<string, unknown>;

const MISSING_SCOPE_CODE = 99991672;
const MISSING_SCOPE_MESSAGE =
  "Lark側の権限が不足しています。Lark開発者コンソールの「権限管理」で contact:contact.base:readonly を追加してアプリを再公開した後、もう一度同期してください。";
const TOKEN_SKEW_MS = 60_000;
const PAGE_SIZE = 50;

let cachedTenantToken: { token: string; expiresAt: number } | null = null;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function parseJson(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return { code: -1, msg: "Lark APIの応答をJSONとして解釈できませんでした。" };
  }
}

function envelopeError(json: JsonRecord, fallback: string): string {
  if (json.code === MISSING_SCOPE_CODE) return MISSING_SCOPE_MESSAGE;
  const msg = textValue(json.msg) ?? textValue(json.message);
  return msg ? `${fallback}（${msg}）` : fallback;
}

export async function getLarkTenantAccessToken(): Promise<LarkResult<string>> {
  if (cachedTenantToken && cachedTenantToken.expiresAt - TOKEN_SKEW_MS > Date.now()) {
    return ok(cachedTenantToken.token);
  }

  const credentials = getLarkAppCredentials();
  if (!credentials) return fail("LARK_APP_IDとLARK_APP_SECRETが設定されていません。");

  const response = await fetch(
    `${getLarkOpenApiBaseUrl()}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: credentials.appId, app_secret: credentials.appSecret }),
      cache: "no-store",
    },
  );
  const json = await parseJson(response);
  const token = textValue(json.tenant_access_token);
  if (!response.ok || json.code !== 0 || !token) {
    return fail(envelopeError(json, "Larkテナントトークンの取得に失敗しました。"), response.status);
  }

  const expireSeconds = typeof json.expire === "number" ? json.expire : 7200;
  cachedTenantToken = { token, expiresAt: Date.now() + expireSeconds * 1000 };
  return ok(token);
}

async function larkGet(path: string, token: string): Promise<LarkResult<JsonRecord>> {
  const response = await fetch(`${getLarkOpenApiBaseUrl()}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const json = await parseJson(response);
  if (!response.ok || json.code !== 0) {
    return fail(envelopeError(json, "Lark APIの呼び出しに失敗しました。"), response.status);
  }
  return ok(json);
}

async function collectPaged(
  token: string,
  buildPath: (pageToken: string | null) => string,
): Promise<LarkResult<JsonRecord[]>> {
  const items: JsonRecord[] = [];
  let pageToken: string | null = null;

  do {
    const result = await larkGet(buildPath(pageToken), token);
    if (!result.ok) return result;

    const data = isRecord(result.data.data) ? result.data.data : {};
    const pageItems = Array.isArray(data.items) ? data.items.filter(isRecord) : [];
    items.push(...pageItems);
    pageToken = data.has_more === true ? textValue(data.page_token) : null;
  } while (pageToken);

  return ok(items);
}

async function listAllDepartmentIds(token: string): Promise<LarkResult<string[]>> {
  const departments = await collectPaged(token, (pageToken) => {
    const params = new URLSearchParams({
      fetch_child: "true",
      page_size: String(PAGE_SIZE),
      department_id_type: "open_department_id",
    });
    if (pageToken) params.set("page_token", pageToken);
    return `/open-apis/contact/v3/departments/0/children?${params.toString()}`;
  });
  if (!departments.ok) return departments;

  const ids = departments.data
    .map((item) => textValue(item.open_department_id) ?? textValue(item.department_id))
    .filter((id): id is string => id !== null);
  return ok(["0", ...ids]);
}

function toTenantUser(item: JsonRecord): LarkTenantUser | null {
  const openId = textValue(item.open_id);
  if (!openId) return null;

  const avatar = isRecord(item.avatar) ? item.avatar : {};
  const status = isRecord(item.status) ? item.status : {};

  return {
    openId,
    unionId: textValue(item.union_id),
    name: textValue(item.name) ?? textValue(item.en_name),
    email: (textValue(item.enterprise_email) ?? textValue(item.email))?.toLowerCase() ?? null,
    avatarUrl:
      textValue(avatar.avatar_240) ??
      textValue(avatar.avatar_origin) ??
      textValue(avatar.avatar_72),
    isResigned: status.is_resigned === true || status.is_frozen === true,
  };
}

/*
 * テナント内の全メンバーを取得する。
 * ルート部署配下を再帰的に辿り、複数部署所属はopen_idで重複排除する。
 */
export async function listLarkTenantUsers(): Promise<LarkResult<LarkTenantUser[]>> {
  const token = await getLarkTenantAccessToken();
  if (!token.ok) return token;

  const departmentIds = await listAllDepartmentIds(token.data);
  if (!departmentIds.ok) return departmentIds;

  const byOpenId = new Map<string, LarkTenantUser>();
  const results = await Promise.all(
    departmentIds.data.map((departmentId) =>
      collectPaged(token.data, (pageToken) => {
        const params = new URLSearchParams({
          department_id: departmentId,
          page_size: String(PAGE_SIZE),
          user_id_type: "open_id",
          department_id_type: "open_department_id",
        });
        if (pageToken) params.set("page_token", pageToken);
        return `/open-apis/contact/v3/users/find_by_department?${params.toString()}`;
      }),
    ),
  );

  for (const result of results) {
    if (!result.ok) return result;
    for (const item of result.data) {
      const user = toTenantUser(item);
      if (user && !byOpenId.has(user.openId)) byOpenId.set(user.openId, user);
    }
  }

  return ok(Array.from(byOpenId.values()));
}
