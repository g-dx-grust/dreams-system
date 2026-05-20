import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listUsers } from "@/server/users";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { UserListTable } from "@/components/users/user-list-table";
import { UserInviteForm } from "@/components/users/user-invite-form";

export default async function UsersPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "admin") redirect("/");

  const res = await listUsers();
  const users = res.ok ? res.data : [];

  return (
    <>
      <PageHeader
        title="ユーザー管理"
        description="システムにアクセスできるユーザーを管理します。"
      />
      <div className="space-y-l">
        <Card>
          <CardHeader>
            <CardTitle>ユーザー一覧</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {users.length === 0 ? (
              <p className="px-l py-m text-s text-text-grey">ユーザーが登録されていません。</p>
            ) : (
              <UserListTable rows={users} currentUserId={currentUser.id} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ユーザーを招待する</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="mb-m text-s text-text-grey">
              招待メールを送信します。ユーザーはメールに記載のリンクからパスワードを設定してログインできます。
            </p>
            <UserInviteForm />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
