"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { DocumentTemplateOption } from "@/server/documents";

const FILE_TYPE_LABELS: Record<string, string> = {
  docx: "Word（.docx）",
  xlsx: "Excel（.xlsx）",
};

/*
 * 帳票履歴一覧の常設フィルタバー。選択は即時反映（URLクエリを更新）し、
 * 適用中フィルタをチップで可視化する。see: DESIGN.md §8.8
 */
export function DocumentHistoryFilter({
  templates,
}: {
  templates: DocumentTemplateOption[];
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

  const templateName = (id: string) => {
    const t = templates.find((template) => String(template.id) === id);
    return t?.name ?? id;
  };

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  const addChip = (key: string, label: string, onRemove?: () => void) =>
    chips.push({ key, label, onRemove: onRemove ?? (() => setParam(key, "")) });

  if (sp.get("q"))
    addChip("q", `キーワード: ${sp.get("q")}`, () => {
      setQ("");
      setParam("q", "");
    });
  if (sp.get("case")) addChip("case", `案件番号: ${sp.get("case")}`);
  if (sp.get("template"))
    addChip("template", `テンプレート: ${templateName(sp.get("template") as string)}`);
  if (sp.get("file_type"))
    addChip(
      "file_type",
      `形式: ${FILE_TYPE_LABELS[sp.get("file_type") as string] ?? sp.get("file_type")}`,
    );
  if (sp.get("date_from")) addChip("date_from", `生成日 ${sp.get("date_from")} から`);
  if (sp.get("date_to")) addChip("date_to", `生成日 ${sp.get("date_to")} まで`);

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
            placeholder="ファイル名・テンプレート名"
          />
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">案件番号</span>
          <Input
            value={sp.get("case") ?? ""}
            onChange={(e) => setParam("case", e.target.value)}
            placeholder="案件番号"
            className="w-[160px]"
          />
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">テンプレート</span>
          <Select
            value={sp.get("template") ?? ""}
            onChange={(e) => setParam("template", e.target.value)}
            className="w-[200px]"
          >
            <option value="">すべて</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">形式</span>
          <Select
            value={sp.get("file_type") ?? ""}
            onChange={(e) => setParam("file_type", e.target.value)}
            className="w-[170px]"
          >
            <option value="">すべて</option>
            <option value="docx">Word（.docx）</option>
            <option value="xlsx">Excel（.xlsx）</option>
          </Select>
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">生成日（開始）</span>
          <Input
            type="date"
            value={sp.get("date_from") ?? ""}
            onChange={(e) => setParam("date_from", e.target.value)}
            className="w-[150px]"
          />
        </label>
        <label className="flex flex-col gap-xs">
          <span className="text-s font-medium text-text-grey">生成日（終了）</span>
          <Input
            type="date"
            value={sp.get("date_to") ?? ""}
            onChange={(e) => setParam("date_to", e.target.value)}
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
