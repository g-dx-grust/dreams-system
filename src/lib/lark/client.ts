const DEFAULT_LARK_OPEN_API_BASE_URL = "https://open.larksuite.com";
const DEFAULT_LARK_AUTH_BASE_URL = "https://accounts.larksuite.com";

export type LarkResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number; code?: number };

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getLarkOpenApiBaseUrl(): string {
  return optionalEnv("LARK_OPEN_API_BASE_URL") ?? DEFAULT_LARK_OPEN_API_BASE_URL;
}

export function getLarkAuthBaseUrl(): string {
  return optionalEnv("LARK_AUTH_BASE_URL") ?? DEFAULT_LARK_AUTH_BASE_URL;
}

export function getLarkAppCredentials(): { appId: string; appSecret: string } | null {
  const appId = optionalEnv("LARK_APP_ID");
  const appSecret = optionalEnv("LARK_APP_SECRET");
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

export function ok<T>(data: T): LarkResult<T> {
  return { ok: true, data };
}

export function fail(error: string, status?: number, code?: number): LarkResult<never> {
  return { ok: false, error, status, code };
}
