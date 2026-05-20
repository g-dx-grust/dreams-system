"use client";

import { useState, useTransition } from "react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { UserRow } from "@/server/users";
import { updateUserRole, setUserActive } from "@/server/users";

const RoleLabels: Record<string, string> = {
  admin: "管理者",
  user: "一般ユーザー",
};

export function UserListTable({
  rows,
  currentUserId,
}: {
  rows: UserRow[];
  currentUserId: string;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>氏名</TH>
          <TH>メールアドレス</TH>
          <TH>ロール</TH>
          <TH>状態</TH>
          <TH>操作</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <UserRow key={row.id} row={row} isSelf={row.id === currentUserId} />
        ))}
      </TBody>
    </Table>
  );
}

function UserRow({ row, isSelf }: { row: UserRow; isSelf: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRoleToggle = () => {
    const newRole = row.role === "admin" ? "user" : "admin";
    setError(null);
    startTransition(async () => {
      const res = await updateUserRole({ userId: row.id, role: newRole });
      if (!res.ok) setError(res.error);
    });
  };

  const handleActiveToggle = () => {
    setError(null);
    startTransition(async () => {
      const res = await setUserActive(row.id, !row.is_active);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <TR>
      <TD>{row.full_name ?? "—"}</TD>
      <TD className="text-text-grey">{row.email}</TD>
      <TD>
        <span className={`text-s ${row.role === "admin" ? "font-medium text-main" : "text-text-black"}`}>
          {RoleLabels[row.role] ?? row.role}
        </span>
      </TD>
      <TD>
        <span className={`text-s ${row.is_active ? "text-success" : "text-text-grey"}`}>
          {row.is_active ? "有効" : "無効"}
        </span>
      </TD>
      <TD>
        {isSelf ? (
          <span className="text-xs text-text-grey">（自分）</span>
        ) : (
          <div className="flex items-center gap-s">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRoleToggle}
              loading={isPending}
            >
              {row.role === "admin" ? "一般に変更" : "管理者に変更"}
            </Button>
            <Button
              variant={row.is_active ? "danger" : "secondary"}
              size="sm"
              onClick={handleActiveToggle}
              loading={isPending}
            >
              {row.is_active ? "無効化する" : "有効化する"}
            </Button>
            {error && <span className="text-xs text-danger">{error}</span>}
          </div>
        )}
      </TD>
    </TR>
  );
}
