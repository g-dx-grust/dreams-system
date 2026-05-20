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
  dateFrom?: string;
  dateTo?: string;
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

  let query = supabase
    .from("audit_logs")
    .select("*, users(full_name, email)", { count: "exact" });

  if (params.action) query = query.eq("action", params.action);
  if (params.entityType) query = query.eq("entity_type", params.entityType);
  if (params.dateFrom) query = query.gte("created_at", `${params.dateFrom}T00:00:00`);
  if (params.dateTo) query = query.lte("created_at", `${params.dateTo}T23:59:59.999`);

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
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
