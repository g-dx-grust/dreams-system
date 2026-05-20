"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { PersonPicker } from "@/components/persons/person-picker";
import type { CasePersonRow, CurrentMasterMap } from "@/server/cases";
import type { PersonRow } from "@/server/persons";
import {
  addCasePerson,
  removeCasePerson,
  resyncCasePerson,
} from "@/server/cases";
import {
  CASE_PERSON_ROLES,
  CasePersonRoleLabels,
  type CasePersonAddInput,
} from "@/lib/validators/case";
import { casePersonRoleLabel, formatDate, addressFull } from "@/lib/format";

export function CasePersonsTab({
  caseId,
  persons,
  currentMaster,
}: {
  caseId: number;
  persons: CasePersonRow[];
  currentMaster: CurrentMasterMap;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedMaster, setSelectedMaster] = useState<PersonRow | null>(null);
  const [role, setRole] = useState<CasePersonAddInput["role"]>("applicant");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState(persons);
  const [masterMap, setMasterMap] = useState(currentMaster);

  useEffect(() => {
    setItems(persons);
  }, [persons]);

  useEffect(() => {
    setMasterMap(currentMaster);
  }, [currentMaster]);

  const handleAdd = () => {
    if (!selectedMaster) return;
    setError(null);
    startTransition(async () => {
      const res = await addCasePerson(caseId, {
        person_id: selectedMaster.id,
        role,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSelectedMaster(null);
      setItems((prev) =>
        [...prev, res.data.row].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
      );
      if (res.data.row.person_id) {
        setMasterMap((prev) => ({
          ...prev,
          [res.data.row.person_id!]: res.data.currentMaster,
        }));
      }
    });
  };

  const handleRemove = (casePersonId: number) => {
    if (!confirm("この関係者を削除しますか？スナップショットも削除されます。")) return;
    startTransition(async () => {
      const res = await removeCasePerson(casePersonId);
      if (!res.ok) setError(res.error);
      else setItems((prev) => prev.filter((person) => person.id !== casePersonId));
    });
  };

  const handleResync = (casePersonId: number) => {
    if (!confirm("マスタの現在値でスナップショットを上書きします。よろしいですか？")) return;
    startTransition(async () => {
      const res = await resyncCasePerson(casePersonId);
      if (!res.ok) setError(res.error);
      else {
        setItems((prev) =>
          prev.map((person) => (person.id === casePersonId ? res.data.row : person)),
        );
        if (res.data.row.person_id) {
          setMasterMap((prev) => ({
            ...prev,
            [res.data.row.person_id!]: res.data.currentMaster,
          }));
        }
      }
    });
  };

  return (
    <div className="flex flex-col gap-l">
      <Card>
        <CardBody>
          <h2 className="text-l font-medium">関係者を追加</h2>
          <p className="mt-xs text-s text-text-grey">
            関係者台帳から選んで役割を指定すると、この時点の値がスナップショットとして案件に保存されます。
          </p>

          <div className="mt-m flex flex-wrap items-end gap-s">
            <div className="flex flex-col gap-xs">
              <label className="text-s font-medium">関係者台帳</label>
              {selectedMaster ? (
                <div className="flex items-center gap-s rounded-s border border-border bg-white px-s py-xs">
                  <span className="font-medium">{selectedMaster.name}</span>
                  {selectedMaster.default_case_role && (
                    <Badge tone="info">
                      {casePersonRoleLabel(selectedMaster.default_case_role)}
                    </Badge>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedMaster(null)}
                    className="text-xs text-text-grey hover:text-text-black"
                  >
                    変更
                  </button>
                </div>
              ) : (
                <Button type="button" variant="secondary" onClick={() => setPickerOpen(true)}>
                  関係者台帳から選択
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-xs">
              <label className="text-s font-medium">役割</label>
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value as CasePersonAddInput["role"])}
                className="w-[200px]"
              >
                {CASE_PERSON_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {CasePersonRoleLabels[r]}
                  </option>
                ))}
              </Select>
            </div>

            <Button type="button" onClick={handleAdd} disabled={!selectedMaster || pending}>
              {pending ? "追加中…" : "追加する"}
            </Button>
          </div>

          {error && (
            <p className="mt-s text-s text-danger" role="alert">
              {error}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="text-l font-medium">関係者一覧</h2>
          {items.length === 0 ? (
            <Empty title="関係者がいません" hint="上のフォームから追加してください。" />
          ) : (
            <ul className="mt-m flex flex-col divide-y divide-border">
              {items.map((p) => {
                const current = p.person_id ? masterMap[p.person_id] : undefined;
                const divergent =
                  current && p.snapshot_name !== null && current.name !== p.snapshot_name;
                const masterDeleted = p.person_id === null;
                return (
                  <li key={p.id} className="py-m">
                    <div className="flex flex-wrap items-start justify-between gap-m">
                      <div className="flex-1">
                        <div className="flex items-center gap-s">
                          <Badge tone="info">{casePersonRoleLabel(p.role)}</Badge>
                          <span className="font-medium text-text-black">
                            {p.snapshot_name ?? "—"}
                          </span>
                          {masterDeleted && <Badge tone="danger">マスタ削除済み</Badge>}
                          {divergent && <Badge tone="warning">マスタと差異あり</Badge>}
                        </div>
                        <div className="mt-xs text-s text-text-grey">
                          {addressFull([
                            p.snapshot_address_pref,
                            p.snapshot_address_city,
                            p.snapshot_address_town,
                            p.snapshot_address_line1,
                            p.snapshot_address_line2,
                          ]) || "—"}
                        </div>
                        <div className="mt-xxs text-xs text-text-grey">
                          電話: {p.snapshot_phone ?? "—"} / メール: {p.snapshot_email ?? "—"}
                        </div>
                        {p.snapshot_at && (
                          <div className="mt-xxs text-xs text-text-grey">
                            スナップショット取得: {formatDate(p.snapshot_at)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-s">
                        {!masterDeleted && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleResync(p.id)}
                            disabled={pending}
                          >
                            マスタから再同期
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="text"
                          size="sm"
                          onClick={() => handleRemove(p.id)}
                          disabled={pending}
                        >
                          削除
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {pickerOpen && (
        <PersonPicker
          onSelect={(person) => {
            setSelectedMaster(person);
            setRole(person.default_case_role ?? "applicant");
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
