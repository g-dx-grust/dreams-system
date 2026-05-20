"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function PersonsFilter({
  defaultQ,
  defaultType,
}: {
  defaultQ?: string;
  defaultType?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(defaultQ ?? "");
  const [type, setType] = useState(defaultType ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(sp.toString());
    if (q) params.set("q", q);
    else params.delete("q");
    if (type) params.set("type", type);
    else params.delete("type");
    params.delete("page");
    router.push(`/persons?${params.toString()}`);
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-s p-m">
      <div className="flex min-w-[240px] flex-1 flex-col gap-xs">
        <label className="text-s font-medium">キーワード</label>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="氏名・フリガナ・住所・役割"
        />
      </div>
      <div className="flex flex-col gap-xs">
        <label className="text-s font-medium">区分</label>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-[140px]">
          <option value="">すべて</option>
          <option value="individual">個人</option>
          <option value="corporation">法人</option>
        </Select>
      </div>
      <Button type="submit" variant="secondary">
        絞り込む
      </Button>
    </form>
  );
}
