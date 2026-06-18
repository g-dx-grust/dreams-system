"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/permissions";
import { type ActionResult, fail, ok } from "@/lib/result";

export type AuditLogRow = {
  id: number;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  detail: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
};

export type ListAuditLogsParams = {
  action?: string;
  entityType?: string;
  userId?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  order?: string;
  page?: number;
  perPage?: number;
};

export async function listAuditLogs(
  params: ListAuditLogsParams = {},
): Promise<
  ActionResult<{
    items: AuditLogRow[];
    total: number;
    page: number;
    perPage: number;
  }>
> {
  await requireAdmin();
  const supabase = await createClient();

  const page = Math.max(1, params.page ?? 1);
  const perPage = Math.min(100, Math.max(1, params.perPage ?? 50));

  // 並べ替え可能な列のホワイトリスト（インジェクション防止）。未指定時は日時の降順。
  const sortColumns: Record<string, string> = {
    created_at: "created_at",
    action: "action",
    entity_type: "entity_type",
  };
  const sortColumn = params.sort ? sortColumns[params.sort] : undefined;
  const ascending = sortColumn
    ? params.order === "asc"
    : false; // 既定：created_at の降順

  let query = supabase
    .from("audit_logs")
    .select("*, users(full_name, email)", { count: "exact" });

  if (params.action) query = query.eq("action", params.action);
  if (params.entityType) query = query.eq("entity_type", params.entityType);
  if (params.userId) query = query.eq("user_id", params.userId);
  if (params.dateFrom) query = query.gte("created_at", `${params.dateFrom}T00:00:00`);
  if (params.dateTo) query = query.lte("created_at", `${params.dateTo}T23:59:59.999`);

  const keyword = params.q?.trim();
  if (keyword) {
    // PostgREST の or フィルタに渡す前に区切り文字（, () *）を無害化する。
    const safe = keyword.replace(/[,()*]/g, " ").trim();
    if (safe) {
      const like = `%${safe}%`;
      const filters = [`action.ilike.${like}`, `entity_type.ilike.${like}`, `ip_address.ilike.${like}`];
      if (/^\d+$/.test(safe)) filters.push(`entity_id.eq.${safe}`);
      query = query.or(filters.join(","));
    }
  }

  const orderedColumn = sortColumn ?? "created_at";
  const { data, count, error } = await query
    .order(orderedColumn, { ascending })
    .range((page - 1) * perPage, page * perPage - 1);

  if (error) return fail("監査ログの取得に失敗しました。");

  const items = (data ?? []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    detail:
      row.detail && typeof row.detail === "object" && !Array.isArray(row.detail)
        ? (row.detail as Record<string, unknown>)
        : null,
    ip_address: row.ip_address,
    created_at: row.created_at,
    user_name: (row.users as { full_name?: string | null } | null)?.full_name ?? null,
    user_email: (row.users as { email?: string | null } | null)?.email ?? null,
  }));

  return ok({ items, total: count ?? 0, page, perPage });
}
