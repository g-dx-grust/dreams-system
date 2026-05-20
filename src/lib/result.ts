export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export const fail = (error: string, field?: string): ActionResult<never> => ({
  ok: false,
  error,
  field,
});
