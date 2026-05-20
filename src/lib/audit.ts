import { createClient } from "@/lib/supabase/server";

export type AuditAction =
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
  | "user.invite"
  | "user.role_change"
  | "user.deactivate"
  | "user.activate";

export type AuditInput = {
  userId: string;
  action: AuditAction;
  entityType: "case" | "person" | "template" | "document" | "user" | "case_person";
  entityId?: number | null;
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
    detail: input.detail ?? {},
    ip_address: input.ipAddress ?? null,
  });

  if (error) {
    console.error("[audit_log] insert failed", { action: input.action, error });
  }
}
