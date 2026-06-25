"use client";

import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listPersons, type PersonRow } from "@/server/persons";
import { casePersonRoleLabel } from "@/lib/format";

export function PersonPicker({
  onSelect,
  onClose,
}: {
  onSelect: (person: PersonRow) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PersonRow[]>([]);
  const [pending, startTransition] = useTransition();

  const load = (query: string) => {
    startTransition(async () => {
      const res = await listPersons({ q: query || undefined, perPage: 20 });
      if (res.ok) setItems(res.data.items);
    });
  };

  useEffect(() => {
    load("");
  }, []);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    load(q);
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-scrim p-m"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[85vh] w-full max-w-[800px] flex-col rounded-l bg-white shadow-m">
        <div className="flex items-center justify-between border-b border-border px-l py-m">
          <h2 className="text-l font-medium">関係者台帳から選択</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-s px-s py-xxs text-s text-text-grey hover:bg-grey-6"
          >
            閉じる
          </button>
        </div>

        <form onSubmit={search} className="flex items-center gap-s border-b border-border px-l py-m">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="氏名・フリガナ・住所・役割で検索"
            className="flex-1"
          />
          <Button type="submit" variant="secondary" loading={pending} loadingLabel="検索中…">
            検索
          </Button>
        </form>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="p-l text-center text-s text-text-grey">
              該当する関係者が見つかりませんでした。
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-[80px]">区分</TH>
                  <TH>氏名</TH>
                  <TH className="w-[120px]">既定役割</TH>
                  <TH>住所</TH>
                  <TH className="w-[80px]" />
                </TR>
              </THead>
              <TBody>
                {items.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <Badge tone={p.person_type === "corporation" ? "info" : "neutral"}>
                        {p.person_type === "corporation" ? "法人" : "個人"}
                      </Badge>
                    </TD>
                    <TD>
                      <div className="font-medium">{p.name}</div>
                      {p.name_kana && <div className="text-xs text-text-grey">{p.name_kana}</div>}
                    </TD>
                    <TD>
                      {p.default_case_role ? (
                        <Badge tone="info">{casePersonRoleLabel(p.default_case_role)}</Badge>
                      ) : (
                        <span className="text-text-grey">—</span>
                      )}
                    </TD>
                    <TD className="text-text-grey">
                      {[p.address_pref, p.address_city, p.address_town].filter(Boolean).join(" ")}
                    </TD>
                    <TD>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          onSelect(p);
                          onClose();
                        }}
                      >
                        選択
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
