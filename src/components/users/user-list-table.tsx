"use client";

import { useState, useTransition } from "react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SortHeader } from "@/components/common/sort-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/format";
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
      <THead sticky>
        <TR>
          <SortHeader column="full_name" label="氏名" />
          <SortHeader column="email" label="メールアドレス" />
          <SortHeader column="role" label="ロール" className="w-[140px]" />
          <SortHeader column="is_active" label="状態" className="w-[100px]" />
          <SortHeader column="last_signed_in" label="最終ログイン" className="w-[160px]" />
          <SortHeader column="created_at" label="登録日" className="w-[120px]" />
          <TH className="w-[260px]">操作</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <UserRowItem key={row.id} row={row} isSelf={row.id === currentUserId} />
        ))}
      </TBody>
    </Table>
  );
}

type Pending = null | "role" | "active";

function UserRowItem({ row, isSelf }: { row: UserRow; isSelf: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [activeOpen, setActiveOpen] = useState(false);
  const [isBusy, startTransition] = useTransition();

  const displayName = row.full_name ?? row.email;
  const nextRole = row.role === "admin" ? "user" : "admin";

  const confirmRole = () => {
    setError(null);
    setPending("role");
    startTransition(async () => {
      const res = await updateUserRole({ userId: row.id, role: nextRole });
      setPending(null);
      if (!res.ok) setError(res.error);
      else setRoleOpen(false);
    });
  };

  const confirmActive = () => {
    setError(null);
    setPending("active");
    startTransition(async () => {
      const res = await setUserActive(row.id, !row.is_active);
      setPending(null);
      if (!res.ok) setError(res.error);
      else setActiveOpen(false);
    });
  };

  return (
    <TR>
      <TD>{row.full_name ?? "—"}</TD>
      <TD className="text-text-grey">{row.email}</TD>
      <TD>
        <Badge tone={row.role === "admin" ? "info" : "neutral"}>
          {RoleLabels[row.role] ?? row.role}
        </Badge>
      </TD>
      <TD>
        <Badge tone={row.is_active ? "success" : "neutral"}>
          {row.is_active ? "有効" : "無効"}
        </Badge>
      </TD>
      <TD className="tabular-nums text-text-grey">{formatDate(row.last_signed_in)}</TD>
      <TD className="tabular-nums text-text-grey">{formatDate(row.created_at)}</TD>
      <TD>
        {isSelf ? (
          <span className="text-xs text-text-grey">（自分）</span>
        ) : (
          <div className="flex flex-wrap items-center gap-s">
            <Button variant="secondary" size="sm" onClick={() => setRoleOpen(true)}>
              {row.role === "admin" ? "一般に変更" : "管理者に変更"}
            </Button>
            <Button
              variant={row.is_active ? "danger" : "secondary"}
              size="sm"
              onClick={() => setActiveOpen(true)}
            >
              {row.is_active ? "無効化する" : "有効化する"}
            </Button>
            {error && <span className="text-xs text-danger">{error}</span>}
          </div>
        )}
      </TD>

      <ConfirmDialog
        open={roleOpen}
        title="ロールを変更します"
        description={
          <>
            <span className="font-semibold text-text-black">{displayName}</span> さんのロールを「
            {RoleLabels[row.role]}」から「{RoleLabels[nextRole]}」に変更します。
            {nextRole === "admin"
              ? "管理者はユーザー管理を含むすべての操作が可能になります。"
              : "一般ユーザーに変更すると、管理者向けの操作ができなくなります。"}
          </>
        }
        confirmLabel="変更する"
        tone="primary"
        loading={isBusy && pending === "role"}
        onConfirm={confirmRole}
        onCancel={() => setRoleOpen(false)}
      />

      <ConfirmDialog
        open={activeOpen}
        title={row.is_active ? "アカウントを無効化します" : "アカウントを有効化します"}
        description={
          row.is_active ? (
            <>
              <span className="font-semibold text-text-black">{displayName}</span>{" "}
              さんのアカウントを無効化します。無効化するとログインできなくなります。
            </>
          ) : (
            <>
              <span className="font-semibold text-text-black">{displayName}</span>{" "}
              さんのアカウントを有効化します。再びログインできるようになります。
            </>
          )
        }
        confirmLabel={row.is_active ? "無効化する" : "有効化する"}
        tone={row.is_active ? "danger" : "primary"}
        loading={isBusy && pending === "active"}
        onConfirm={confirmActive}
        onCancel={() => setActiveOpen(false)}
      />
    </TR>
  );
}
