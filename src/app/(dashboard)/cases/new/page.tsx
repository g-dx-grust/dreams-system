import { PageHeader } from "@/components/ui/page-header";
import { CaseCreateForm } from "@/components/cases/case-create-form";
import { listAssignableUsers } from "@/server/cases";

export default async function NewCasePage() {
  const usersRes = await listAssignableUsers();
  const users = usersRes.ok ? usersRes.data : [];

  return (
    <>
      <PageHeader
        title="案件を登録する"
        description="案件番号は種別に応じて自動採番されます（例: 2026-FC-001）。"
      />
      <CaseCreateForm users={users} />
    </>
  );
}
