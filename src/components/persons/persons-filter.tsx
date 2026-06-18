"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/*
 * 関係者台帳の常設フィルタバー。選択は即時反映（URLクエリを更新）し、
 * 適用中フィルタをチップで可視化する。see: DESIGN.md §8.8
 */
const PERSON_TYPE_LABELS: Record<string, string> = {
  individual: "個人",
  corporation: "法人",
};

export function PersonsFilter() {
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

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  const addChip = (key: string, label: string, onRemove?: () => void) =>
    chips.push({ key, label, onRemove: onRemove ?? (() => setParam(key, "")) });

  if (sp.get("q"))
    addChip("q", `キーワード: ${sp.get("q")}`, () => {
      setQ("");
      setParam("q", "");
    });
  if (sp.get("type"))
    addChip(
      "type",
      `区分: ${PERSON_TYPE_LABELS[sp.get("type") as string] ?? sp.get("type")}`,
    );

  const clearAll = () => {
    setQ("");
    router.push(pathname);
  };

  return (
    <div className="flex flex-col gap-s p-m">
      <div className="flex flex-wrap items-end gap-s">
        <label className="flex min-w-[240px] flex-1 flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">キーワード</span>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="氏名・フリガナ・住所・役割"
          />
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">区分</span>
          <Select
            value={sp.get("type") ?? ""}
            onChange={(e) => setParam("type", e.target.value)}
            className="w-[140px]"
          >
            <option value="">すべて</option>
            <option value="individual">個人</option>
            <option value="corporation">法人</option>
          </Select>
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
