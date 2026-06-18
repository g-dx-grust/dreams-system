"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
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

type Confirm =
  | { kind: "remove"; person: CasePersonRow }
  | { kind: "resync"; person: CasePersonRow };

export function CasePersonsTab({
  caseId,
  persons,
  currentMaster,
}: {
  caseId: number;
  persons: CasePersonRow[];
  currentMaster: CurrentMasterMap;
}) {
  const toast = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedMaster, setSelectedMaster] = useState<PersonRow | null>(null);
  const [role, setRole] = useState<CasePersonAddInput["role"]>("applicant");
  const [adding, startAdding] = useTransition();
  const [addError, setAddError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [items, setItems] = useState(persons);
  const [masterMap, setMasterMap] = useState(currentMaster);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busyRowId, setBusyRowId] = useState<number | null>(null);
  const [confirmBusy, startConfirm] = useTransition();

  useEffect(() => {
    setItems(persons);
  }, [persons]);

  useEffect(() => {
    setMasterMap(currentMaster);
  }, [currentMaster]);

  const handleAdd = () => {
    if (!selectedMaster) return;
    setAddError(null);
    startAdding(async () => {
      const res = await addCasePerson(caseId, {
        person_id: selectedMaster.id,
        role,
      });
      if (!res.ok) {
        setAddError(res.error);
        return;
      }
      setSelectedMaster(null);
      setItems((prev) =>
        [...prev, res.data.row].sort(
          (a, b) => a.sort_order - b.sort_order || a.id - b.id,
        ),
      );
      if (res.data.row.person_id) {
        setMasterMap((prev) => ({
          ...prev,
          [res.data.row.person_id!]: res.data.currentMaster,
        }));
      }
      toast({ message: "関係者を追加しました", tone: "success" });
    });
  };

  const handleConfirm = () => {
    if (!confirm) return;
    const target = confirm.person;
    setRowError(null);
    setBusyRowId(target.id);
    startConfirm(async () => {
      if (confirm.kind === "remove") {
        const res = await removeCasePerson(target.id);
        if (!res.ok) {
          setRowError(res.error);
        } else {
          setItems((prev) => prev.filter((person) => person.id !== target.id));
          setConfirm(null);
          toast({ message: "関係者を削除しました", tone: "success" });
        }
      } else {
        const res = await resyncCasePerson(target.id);
        if (!res.ok) {
          setRowError(res.error);
        } else {
          setItems((prev) =>
            prev.map((person) =>
              person.id === target.id ? res.data.row : person,
            ),
          );
          if (res.data.row.person_id) {
            setMasterMap((prev) => ({
              ...prev,
              [res.data.row.person_id!]: res.data.currentMaster,
            }));
          }
          setConfirm(null);
          toast({ message: "マスタから再同期しました", tone: "success" });
        }
      }
      setBusyRowId(null);
    });
  };

  const handleCancelConfirm = () => {
    if (confirmBusy) return;
    setConfirm(null);
    setBusyRowId(null);
  };

  return (
    <div className="flex flex-col gap-l">
      <Card>
        <CardBody>
          <h2 className="text-l font-semibold">関係者を追加</h2>
          <p className="mt-xs text-s text-text-grey">
            関係者台帳から選んで役割を指定すると、この時点の値がスナップショットとして案件に保存されます。
          </p>

          <div className="mt-m flex flex-wrap items-end gap-s">
            <div className="flex flex-col gap-xs">
              <label className="text-s font-medium text-text-grey">関係者台帳</label>
              {selectedMaster ? (
                <div className="flex h-8 items-center gap-s rounded-s border border-border bg-white px-s">
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
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPickerOpen(true)}
                >
                  関係者台帳から選択
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-xs">
              <label className="text-s font-medium text-text-grey">役割</label>
              <Select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as CasePersonAddInput["role"])
                }
                className="w-[200px]"
              >
                {CASE_PERSON_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {CasePersonRoleLabels[r]}
                  </option>
                ))}
              </Select>
            </div>

            <Button
              type="button"
              onClick={handleAdd}
              disabled={!selectedMaster}
              loading={adding}
              loadingLabel="追加中…"
            >
              追加する
            </Button>
          </div>

          {addError && (
            <p
              className="mt-s rounded-s border border-danger bg-danger-soft p-s text-s text-danger"
              role="alert"
            >
              {addError}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="flex items-baseline justify-between">
            <h2 className="text-l font-semibold">関係者一覧</h2>
            <span className="text-s text-text-grey tabular-nums">
              全{items.length}件
            </span>
          </div>

          {rowError && (
            <p
              className="mt-s rounded-s border border-danger bg-danger-soft p-s text-s text-danger"
              role="alert"
            >
              {rowError}
            </p>
          )}

          {items.length === 0 ? (
            <div className="mt-m">
              <Empty
                title="関係者がいません"
                hint="上のフォームから追加してください。"
              />
            </div>
          ) : (
            <div className="mt-m">
              <Table>
                <THead>
                  <tr>
                    <TH>役割</TH>
                    <TH>氏名（スナップショット）</TH>
                    <TH>住所</TH>
                    <TH>電話 / メール</TH>
                    <TH>マスタとの差分</TH>
                    <TH className="text-right">操作</TH>
                  </tr>
                </THead>
                <TBody>
                  {items.map((p) => {
                    const current = p.person_id
                      ? masterMap[p.person_id]
                      : undefined;
                    const divergent =
                      current &&
                      p.snapshot_name !== null &&
                      current.name !== p.snapshot_name;
                    const masterDeleted = p.person_id === null;
                    const rowBusy = busyRowId === p.id;
                    const address =
                      addressFull([
                        p.snapshot_address_pref,
                        p.snapshot_address_city,
                        p.snapshot_address_town,
                        p.snapshot_address_line1,
                        p.snapshot_address_line2,
                      ]) || "—";
                    return (
                      <TR key={p.id} className={rowBusy ? "opacity-60" : undefined}>
                        <TD>
                          <Badge tone="info">{casePersonRoleLabel(p.role)}</Badge>
                        </TD>
                        <TD>
                          <span className="font-medium text-text-black">
                            {p.snapshot_name ?? "—"}
                          </span>
                          {p.snapshot_at && (
                            <span className="mt-xxs block text-xs text-text-grey">
                              取得 {formatDate(p.snapshot_at)}
                            </span>
                          )}
                        </TD>
                        <TD>
                          <span className="text-s text-text-grey">{address}</span>
                        </TD>
                        <TD>
                          <span className="text-s text-text-grey">
                            {p.snapshot_phone ?? "—"}
                          </span>
                          <span className="mt-xxs block text-xs text-text-grey">
                            {p.snapshot_email ?? "—"}
                          </span>
                        </TD>
                        <TD>
                          {masterDeleted ? (
                            <Badge tone="danger">マスタ削除済み</Badge>
                          ) : divergent ? (
                            <Badge tone="warning">差異あり</Badge>
                          ) : (
                            <span className="text-s text-text-grey">一致</span>
                          )}
                        </TD>
                        <TD className="text-right">
                          <div className="inline-flex items-center justify-end gap-xs">
                            {!masterDeleted && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  setConfirm({ kind: "resync", person: p })
                                }
                                disabled={rowBusy}
                                aria-label={`${p.snapshot_name ?? "関係者"}をマスタから再同期`}
                              >
                                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                                再同期
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="text"
                              size="sm"
                              onClick={() =>
                                setConfirm({ kind: "remove", person: p })
                              }
                              disabled={rowBusy}
                              aria-label={`${p.snapshot_name ?? "関係者"}を削除`}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              削除
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
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

      <ConfirmDialog
        open={confirm?.kind === "remove"}
        title="関係者を削除します"
        description={
          <>
            関係者『{confirm?.person.snapshot_name ?? "—"}』を案件から削除します。
            スナップショットも削除され、元に戻せません。
          </>
        }
        confirmLabel="削除する"
        tone="danger"
        loading={confirmBusy}
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
      />

      <ConfirmDialog
        open={confirm?.kind === "resync"}
        title="マスタから再同期します"
        description={
          <>
            関係者『{confirm?.person.snapshot_name ?? "—"}』のスナップショットを、
            関係者台帳の現在値で上書きします。この操作は元に戻せません。
          </>
        }
        confirmLabel="再同期する"
        tone="primary"
        loading={confirmBusy}
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
      />
    </div>
  );
}
