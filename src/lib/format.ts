import {
  CaseStatusLabels,
  CaseTypeLabels,
  CasePersonRoleLabels,
} from "@/lib/validators/case";

export function caseTypeLabel(code: string): string {
  return (CaseTypeLabels as Record<string, string>)[code] ?? code;
}

export function caseStatusLabel(code: string): string {
  return (CaseStatusLabels as Record<string, string>)[code] ?? code;
}

export function casePersonRoleLabel(code: string): string {
  return (CasePersonRoleLabels as Record<string, string>)[code] ?? code;
}

export function caseStatusTone(
  code: string,
): "neutral" | "info" | "warning" | "success" | "danger" {
  switch (code) {
    case "inquiry":
      return "neutral";
    case "in_progress":
      return "info";
    case "submitted":
      return "info";
    case "approved":
      return "success";
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function caseTypeTone(code: string): "neutral" | "info" | "warning" {
  switch (code) {
    case "farmland_conversion":
      return "info";
    case "land_improvement":
      return "info";
    case "boundary_survey":
      return "info";
    case "building_permit":
      return "warning";
    default:
      return "neutral";
  }
}

export function formatJPY(v: number | null | undefined): string {
  if (v == null) return "—";
  return `¥${v.toLocaleString("ja-JP")}`;
}

export function formatDate(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("ja-JP");
}

export function isOverdue(
  deadline: string | null,
  status: string,
): boolean {
  if (!deadline) return false;
  if (status === "completed" || status === "cancelled") return false;
  return new Date(deadline) < new Date(new Date().toDateString());
}

export function addressFull(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

