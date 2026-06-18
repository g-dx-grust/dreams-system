import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { listUsers } from "@/server/users";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { UsersFilter } from "@/components/users/users-filter";
import { UserListTable } from "@/components/users/user-list-table";
import { UserInviteForm } from "@/components/users/user-invite-form";

type Search = {
  q?: string;
  role?: string;
  active?: string;
  sort?: string;
  order?: string;
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "admin") redirect("/");

  const sp = await searchParams;
  const res = await listUsers({
    q: sp.q,
    role: sp.role,
    active: sp.active,
    sort: sp.sort,
    order: sp.order,
  });
  const users = res.ok ? res.data : [];
  const total = users.length;

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
            <div className="border-b border-border">
              <UsersFilter />
            </div>

            <div className="flex items-center justify-between gap-m px-m py-s text-s text-text-grey">
              <p>
                全 <span className="font-semibold text-text-black tabular-nums">{total}</span> 件
              </p>
            </div>

            {total === 0 ? (
              <Empty
                title="該当するユーザーがいません"
                hint="絞り込み条件を変えるか、「ユーザーを招待する」から追加してください。"
                action={
                  <a href="#invite">
                    <Button>ユーザーを招待する</Button>
                  </a>
                }
              />
            ) : (
              <UserListTable rows={users} currentUserId={currentUser.id} />
            )}
          </CardBody>
        </Card>

        <Card id="invite">
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
