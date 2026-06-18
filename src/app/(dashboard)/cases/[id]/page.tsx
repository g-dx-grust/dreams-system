import { notFound } from "next/navigation";
import { listAssignableUsers } from "@/server/cases";
import { getCaseSummary } from "@/server/case-summary";
import { CaseEditForm } from "@/components/cases/case-edit-form";
import { CASE_TYPES, CASE_STATUSES, type CaseUpdateInput } from "@/lib/validators/case";

export default async function CaseBasicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [caseRes, usersRes] = await Promise.all([
    getCaseSummary(Number(id)),
    listAssignableUsers(),
  ]);
  if (!caseRes.ok) notFound();
  const c = caseRes.data;

  const caseType: (typeof CASE_TYPES)[number] = CASE_TYPES.includes(
    c.case_type as (typeof CASE_TYPES)[number],
  )
    ? (c.case_type as (typeof CASE_TYPES)[number])
    : "other";
  const status: (typeof CASE_STATUSES)[number] = CASE_STATUSES.includes(
    c.status as (typeof CASE_STATUSES)[number],
  )
    ? (c.status as (typeof CASE_STATUSES)[number])
    : "inquiry";

  const defaults: CaseUpdateInput = {
    case_name: c.case_name,
    case_type: caseType,
    status,
    assigned_user_id: c.assigned_user_id ?? null,
    submission_target: c.submission_target ?? "",
    submission_date: c.submission_date ?? "",
    deadline_date: c.deadline_date ?? "",
    latitude: c.latitude ?? undefined,
    longitude: c.longitude ?? undefined,
    memo: c.memo ?? "",
  };

  return (
    <CaseEditForm
      caseId={c.id}
      users={usersRes.ok ? usersRes.data : []}
      defaults={defaults}
    />
  );
}
