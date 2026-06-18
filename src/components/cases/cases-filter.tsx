"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CASE_TYPES,
  CASE_STATUSES,
  CaseTypeLabels,
  CaseStatusLabels,
} from "@/lib/validators/case";
import type { AssignableUser } from "@/server/cases";

/*
 * 案件一覧の常設フィルタバー。選択は即時反映（URLクエリを更新）し、
 * 適用中フィルタをチップで可視化する。see: DESIGN.md §8.8
 */
export function CasesFilter({ users }: { users: AssignableUser[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [q, setQ] = useState(sp.get("q") ?? "");
  const firstRender = useRef(true);

  const pushWith = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(sp.toString());
    mutate(params);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const setParam = (key: string, value: string) =>
    pushWith((params) => (value ? params.set(key, value) : params.delete(key)));

  // キーワードはデバウンス（300ms）後に反映
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(() => {
      const current = sp.get("q") ?? "";
      const next = q.trim();
      if (next === current) return;
      pushWith((params) => (next ? params.set("q", next) : params.delete("q")));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sp, pathname, router]);

  const userName = (id: string) => {
    const u = users.find((user) => user.id === id);
    return u?.full_name ?? u?.email ?? id;
  };

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  const addChip = (key: string, label: string, onRemove?: () => void) =>
    chips.push({ key, label, onRemove: onRemove ?? (() => setParam(key, "")) });

  if (sp.get("q"))
    addChip("q", `キーワード: ${sp.get("q")}`, () => {
      setQ("");
      setParam("q", "");
    });
  if (sp.get("type"))
    addChip("type", `種別: ${CaseTypeLabels[sp.get("type") as keyof typeof CaseTypeLabels] ?? sp.get("type")}`);
  if (sp.get("status"))
    addChip(
      "status",
      `ステータス: ${CaseStatusLabels[sp.get("status") as keyof typeof CaseStatusLabels] ?? sp.get("status")}`,
    );
  if (sp.get("user")) addChip("user", `担当者: ${userName(sp.get("user") as string)}`);
  if (sp.get("deadline_from")) addChip("deadline_from", `締切 ${sp.get("deadline_from")} から`);
  if (sp.get("deadline_to")) addChip("deadline_to", `締切 ${sp.get("deadline_to")} まで`);
  if (sp.get("overdue") === "1") addChip("overdue", "期限超過のみ");

  const clearAll = () => {
    setQ("");
    router.push(pathname);
  };

  return (
    <div className="flex flex-col gap-s p-m">
      <div className="flex flex-wrap items-end gap-s">
        <label className="flex min-w-[220px] flex-1 flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">キーワード</span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="案件番号・案件名" />
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">種別</span>
          <Select
            value={sp.get("type") ?? ""}
            onChange={(e) => setParam("type", e.target.value)}
            className="w-[160px]"
          >
            <option value="">すべて</option>
            {CASE_TYPES.map((t) => (
              <option key={t} value={t}>
                {CaseTypeLabels[t]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">ステータス</span>
          <Select
            value={sp.get("status") ?? ""}
            onChange={(e) => setParam("status", e.target.value)}
            className="w-[130px]"
          >
            <option value="">すべて</option>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CaseStatusLabels[s]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">担当者</span>
          <Select
            value={sp.get("user") ?? ""}
            onChange={(e) => setParam("user", e.target.value)}
            className="w-[150px]"
          >
            <option value="">すべて</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name ?? u.email}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">締切（開始）</span>
          <Input
            type="date"
            value={sp.get("deadline_from") ?? ""}
            onChange={(e) => setParam("deadline_from", e.target.value)}
            className="w-[150px]"
          />
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">締切（終了）</span>
          <Input
            type="date"
            value={sp.get("deadline_to") ?? ""}
            onChange={(e) => setParam("deadline_to", e.target.value)}
            className="w-[150px]"
          />
        </label>
        <label className="flex h-8 items-center gap-xs text-s text-text-black">
          <Checkbox
            checked={sp.get("overdue") === "1"}
            onChange={(e) => setParam("overdue", e.target.checked ? "1" : "")}
          />
          期限超過のみ
        </label>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-xs">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-xxs rounded-s bg-grey-7 py-xxs pl-s pr-xxs text-xs text-text-grey"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`${chip.label} を解除`}
                className="flex h-4 w-4 items-center justify-center rounded-s text-text-quaternary hover:bg-grey-20 hover:text-text-black"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="ml-xs text-xs text-text-link hover:underline"
          >
            すべて解除
          </button>
        </div>
      )}
    </div>
  );
}
