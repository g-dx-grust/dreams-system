"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  CASE_TYPES,
  CASE_STATUSES,
  CaseTypeLabels,
  CaseStatusLabels,
} from "@/lib/validators/case";
import type { AssignableUser } from "@/server/cases";

type Props = {
  defaultQ?: string;
  defaultType?: string;
  defaultStatus?: string;
  defaultUser?: string;
  defaultDeadlineFrom?: string;
  defaultDeadlineTo?: string;
  defaultOverdue?: boolean;
  users: AssignableUser[];
};

export function CasesFilter({
  defaultQ,
  defaultType,
  defaultStatus,
  defaultUser,
  defaultDeadlineFrom,
  defaultDeadlineTo,
  defaultOverdue,
  users,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(defaultQ ?? "");
  const [type, setType] = useState(defaultType ?? "");
  const [status, setStatus] = useState(defaultStatus ?? "");
  const [user, setUser] = useState(defaultUser ?? "");
  const [deadlineFrom, setDeadlineFrom] = useState(defaultDeadlineFrom ?? "");
  const [deadlineTo, setDeadlineTo] = useState(defaultDeadlineTo ?? "");
  const [overdue, setOverdue] = useState(!!defaultOverdue);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(sp.toString());
    if (q) params.set("q", q);
    else params.delete("q");
    if (type) params.set("type", type);
    else params.delete("type");
    if (status) params.set("status", status);
    else params.delete("status");
    if (user) params.set("user", user);
    else params.delete("user");
    if (deadlineFrom) params.set("deadline_from", deadlineFrom);
    else params.delete("deadline_from");
    if (deadlineTo) params.set("deadline_to", deadlineTo);
    else params.delete("deadline_to");
    if (overdue) params.set("overdue", "1");
    else params.delete("overdue");
    params.delete("page");
    router.push(`/cases?${params.toString()}`);
  };

  const reset = () => {
    setQ("");
    setType("");
    setStatus("");
    setUser("");
    setDeadlineFrom("");
    setDeadlineTo("");
    setOverdue(false);
    router.push("/cases");
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-s p-m">
      <div className="flex min-w-[220px] flex-1 flex-col gap-xs">
        <label className="text-s font-medium">キーワード</label>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="案件番号・案件名" />
      </div>
      <div className="flex flex-col gap-xs">
        <label className="text-s font-medium">種別</label>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-[160px]">
          <option value="">すべて</option>
          {CASE_TYPES.map((t) => (
            <option key={t} value={t}>
              {CaseTypeLabels[t]}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-xs">
        <label className="text-s font-medium">ステータス</label>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-[130px]">
          <option value="">すべて</option>
          {CASE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CaseStatusLabels[s]}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-xs">
        <label className="text-s font-medium">担当者</label>
        <Select value={user} onChange={(e) => setUser(e.target.value)} className="w-[140px]">
          <option value="">すべて</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name ?? u.email}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-xs">
        <label className="text-s font-medium">締切日（開始）</label>
        <Input
          type="date"
          value={deadlineFrom}
          onChange={(e) => setDeadlineFrom(e.target.value)}
          className="w-[140px]"
        />
      </div>
      <div className="flex flex-col gap-xs">
        <label className="text-s font-medium">締切日（終了）</label>
        <Input
          type="date"
          value={deadlineTo}
          onChange={(e) => setDeadlineTo(e.target.value)}
          className="w-[140px]"
        />
      </div>
      <label className="flex items-center gap-xs text-s">
        <input
          type="checkbox"
          checked={overdue}
          onChange={(e) => setOverdue(e.target.checked)}
        />
        期限超過のみ
      </label>
      <div className="flex gap-xs">
        <Button type="submit" variant="secondary">
          絞り込む
        </Button>
        <Button type="button" variant="text" onClick={reset}>
          リセット
        </Button>
      </div>
    </form>
  );
}
