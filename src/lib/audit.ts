import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditAction =
  | "auth.login_success"
  | "auth.login_failure"
  | "case.create"
  | "case.update"
  | "case.delete"
  | "case_person.add"
  | "case_person.remove"
  | "case_person.resync"
  | "person.create"
  | "person.update"
  | "person.delete"
  | "person.resync"
  | "template.upload"
  | "template.update"
  | "template.deactivate"
  | "document.generate"
  | "document.download"
  | "map.coordinate_import"
  | "schedule.create"
  | "schedule.update"
  | "schedule.delete"
  | "daily_report.save"
  | "daily_report.submit"
  | "comment.create"
  | "user.invite"
  | "user.role_change"
  | "user.deactivate"
  | "user.activate"
  | "user.lark_sync";

export type AuditInput = {
  userId: string;
  action: AuditAction;
  entityType:
    | "case"
    | "person"
    | "template"
    | "document"
    | "user"
    | "case_person"
    | "map_coordinate_point"
    | "schedule"
    | "daily_report"
    | "comment"
    | "auth";
  entityId?: number | null;
  entityIdUuid?: string | null;
  detail?: Record<string, unknown>;
  ipAddress?: string | null;
};

export async function logAudit(input: AuditInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("audit_logs").insert({
    user_id: input.userId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    ...(input.entityIdUuid ? { entity_id_uuid: input.entityIdUuid } : {}),
    detail: input.detail ?? {},
    ip_address: input.ipAddress ?? null,
  });

  if (error) {
    console.error("[audit_log] insert failed", { action: input.action, error });
  }
}

export type SystemAuditInput = Omit<AuditInput, "userId"> & {
  userId?: string | null;
};

export async function logSystemAudit(input: SystemAuditInput): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("audit_logs").insert({
      user_id: input.userId ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      ...(input.entityIdUuid ? { entity_id_uuid: input.entityIdUuid } : {}),
      detail: input.detail ?? {},
      ip_address: input.ipAddress ?? null,
    });

    if (error) {
      console.error("[audit_log] system insert failed", { action: input.action, error });
    }
  } catch (error) {
    console.error("[audit_log] system insert unavailable", { action: input.action, error });
  }
}
