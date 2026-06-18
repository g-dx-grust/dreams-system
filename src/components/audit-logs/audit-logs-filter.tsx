"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { auditActionLabel, auditEntityLabel } from "@/lib/audit-labels";

export type AuditLogUserOption = { id: string; full_name: string | null; email: string };

/*
 * 監査ログ一覧の常設フィルタバー。選択は即時反映（URLクエリを更新）し、
 * 適用中フィルタをチップで可視化する。see: DESIGN.md §8.8
 */
export function AuditLogsFilter({
  users,
  actions,
  entityTypes,
}: {
  users: AuditLogUserOption[];
  actions: readonly string[];
  entityTypes: readonly string[];
}) {
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
  if (sp.get("user")) addChip("user", `ユーザー: ${userName(sp.get("user") as string)}`);
  if (sp.get("action"))
    addChip("action", `アクション: ${auditActionLabel(sp.get("action") as string)}`);
  if (sp.get("entityType"))
    addChip("entityType", `対象: ${auditEntityLabel(sp.get("entityType") as string)}`);
  if (sp.get("dateFrom")) addChip("dateFrom", `${sp.get("dateFrom")} から`);
  if (sp.get("dateTo")) addChip("dateTo", `${sp.get("dateTo")} まで`);

  const clearAll = () => {
    setQ("");
    router.push(pathname);
  };

  return (
    <div className="flex flex-col gap-s p-m">
      <div className="flex flex-wrap items-end gap-s">
        <label className="flex min-w-[220px] flex-1 flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">キーワード</span>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="アクション・対象・IP・対象 ID"
          />
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">ユーザー</span>
          <Select
            value={sp.get("user") ?? ""}
            onChange={(e) => setParam("user", e.target.value)}
            className="w-[180px]"
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
          <span className="text-s font-medium text-text-grey">アクション</span>
          <Select
            value={sp.get("action") ?? ""}
            onChange={(e) => setParam("action", e.target.value)}
            className="w-[220px]"
          >
            <option value="">すべて</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {auditActionLabel(action)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">対象</span>
          <Select
            value={sp.get("entityType") ?? ""}
            onChange={(e) => setParam("entityType", e.target.value)}
            className="w-[160px]"
          >
            <option value="">すべて</option>
            {entityTypes.map((entityType) => (
              <option key={entityType} value={entityType}>
                {auditEntityLabel(entityType)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">期間（開始）</span>
          <Input
            type="date"
            value={sp.get("dateFrom") ?? ""}
            onChange={(e) => setParam("dateFrom", e.target.value)}
            className="w-[150px]"
          />
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">期間（終了）</span>
          <Input
            type="date"
            value={sp.get("dateTo") ?? ""}
            onChange={(e) => setParam("dateTo", e.target.value)}
            className="w-[150px]"
          />
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
