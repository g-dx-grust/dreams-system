"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SortHeader } from "@/components/common/sort-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  caseStatusLabel,
  caseStatusTone,
  caseTypeLabel,
  caseTypeTone,
  formatDate,
  isOverdue,
} from "@/lib/format";
import { CASE_STATUSES, CaseStatusLabels } from "@/lib/validators/case";
import { bulkDeleteCases, bulkUpdateCaseStatus, type CaseRow } from "@/server/cases";
import { bulkGenerateForCases } from "@/server/documents";

type UserInfo = { full_name: string | null; email: string };
type Busy = null | "status" | "delete" | "generate";

export function CasesTable({
  items,
  userMap,
  isAdmin,
}: {
  items: CaseRow[];
  userMap: Record<string, UserInfo>;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [statusValue, setStatusValue] = React.useState("");
  const [busy, setBusy] = React.useState<Busy>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [generateOpen, setGenerateOpen] = React.useState(false);

  // 表示中の行に存在しない選択を捨てる（ページ遷移後の取りこぼし防止）
  const visibleIds = React.useMemo(() => new Set(items.map((c) => c.id)), [items]);
  const selectedIds = React.useMemo(
    () => [...selected].filter((id) => visibleIds.has(id)),
    [selected, visibleIds],
  );
  const selectedCount = selectedIds.length;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(items.map((c) => c.id)));
  const toggleOne = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const afterMutation = (message: string) => {
    clearSelection();
    setStatusValue("");
    toast({ message, tone: "success" });
    router.refresh();
  };

  const applyStatus = async () => {
    if (!statusValue || selectedCount === 0) return;
    setBusy("status");
    try {
      const result = await bulkUpdateCaseStatus(selectedIds, statusValue);
      if (result.ok) afterMutation(`${result.data.count} 件のステータスを変更しました。`);
      else toast({ message: result.error, tone: "danger" });
    } catch {
      toast({ message: "ステータスの一括変更に失敗しました。", tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const runDelete = async () => {
    setBusy("delete");
    try {
      const result = await bulkDeleteCases(selectedIds);
      if (result.ok) {
        setDeleteOpen(false);
        afterMutation(`${result.data.count} 件の案件を削除しました。`);
      } else {
        toast({ message: result.error, tone: "danger" });
      }
    } catch {
      toast({ message: "案件の一括削除に失敗しました。", tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const runGenerate = async () => {
    setBusy("generate");
    try {
      const result = await bulkGenerateForCases(selectedIds, true);
      if (result.ok) {
        setGenerateOpen(false);
        const { casesSucceeded, casesFailed, totalDocuments } = result.data;
        const failNote = casesFailed > 0 ? `（${casesFailed} 件は生成対象なし/失敗）` : "";
        afterMutation(`${casesSucceeded} 件の案件で ${totalDocuments} 帳票を生成しました。${failNote}`);
      } else {
        toast({ message: result.error, tone: "danger" });
      }
    } catch {
      toast({ message: "帳票の一括生成に失敗しました。", tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {selectedCount > 0 && (
        <div className="mb-s flex flex-wrap items-center gap-s rounded-m border border-border bg-main-soft px-m py-s">
          <span className="text-s font-medium text-text-black tabular-nums">
            {selectedCount} 件を選択中
          </span>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <div className="flex items-center gap-xs">
            <Select
              value={statusValue}
              onChange={(e) => setStatusValue(e.target.value)}
              className="w-[150px]"
              aria-label="変更後のステータス"
            >
              <option value="">ステータス変更…</option>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CaseStatusLabels[s]}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="secondary"
              disabled={!statusValue || busy !== null}
              loading={busy === "status"}
              loadingLabel="変更中…"
              onClick={applyStatus}
            >
              変更
            </Button>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => setGenerateOpen(true)}
          >
            帳票を一括生成
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="danger"
              disabled={busy !== null}
              onClick={() => setDeleteOpen(true)}
            >
              削除
            </Button>
          )}
          <Button size="sm" variant="text" onClick={clearSelection}>
            選択解除
          </Button>
        </div>
      )}

      <Card>
        <Table>
          <THead>
            <TR>
              <TH className="w-[44px]">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleAll}
                  aria-label="すべて選択"
                />
              </TH>
              <SortHeader column="case_number" label="案件番号" className="w-[150px]" />
              <SortHeader column="case_name" label="案件名" />
              <SortHeader column="case_type" label="種別" className="w-[130px]" />
              <SortHeader column="status" label="ステータス" className="w-[120px]" />
              <TH className="w-[130px]">担当者</TH>
              <TH className="w-[150px]">提出先</TH>
              <SortHeader column="deadline" label="締切日" className="w-[120px]" />
              <TH className="w-[72px]">操作</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((c) => {
              const overdue = isOverdue(c.deadline_date, c.status);
              const assignedUser = c.assigned_user_id != null ? userMap[c.assigned_user_id] : undefined;
              const checked = selected.has(c.id);
              return (
                <TR key={c.id} selected={checked}>
                  <TD>
                    <Checkbox
                      checked={checked}
                      onChange={() => toggleOne(c.id)}
                      aria-label={`${c.case_number} を選択`}
                    />
                  </TD>
                  <TD className="tabular-nums">
                    <Link href={`/cases/${c.id}`} className="ui-link">
                      {c.case_number}
                    </Link>
                  </TD>
                  <TD>
                    <Link href={`/cases/${c.id}`} className="ui-link-subtle">
                      {c.case_name}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={caseTypeTone(c.case_type)}>{caseTypeLabel(c.case_type)}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={caseStatusTone(c.status)}>{caseStatusLabel(c.status)}</Badge>
                  </TD>
                  <TD className="text-text-grey">
                    {assignedUser?.full_name ?? assignedUser?.email ?? "—"}
                  </TD>
                  <TD className="text-text-grey">{c.submission_target ?? "—"}</TD>
                  <TD className={cn("tabular-nums", overdue && "font-medium text-danger")}>
                    {formatDate(c.deadline_date)}
                  </TD>
                  <TD>
                    <Link href={`/cases/${c.id}`} className="ui-link text-s">
                      詳細
                    </Link>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        title="選択した案件を削除します"
        description={
          <>
            選択中の <span className="font-semibold text-text-black">{selectedCount}</span>{" "}
            件の案件を削除します。関係者・土地・金額・帳票履歴も含めて削除され、元に戻せません。
          </>
        }
        confirmLabel="削除する"
        tone="danger"
        loading={busy === "delete"}
        onConfirm={runDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      <ConfirmDialog
        open={generateOpen}
        title="帳票を一括生成します"
        description={
          <>
            選択中の <span className="font-semibold text-text-black">{selectedCount}</span>{" "}
            件の案件について、各案件種別に適用される帳票をまとめて生成します。
          </>
        }
        confirmLabel="生成する"
        tone="primary"
        loading={busy === "generate"}
        onConfirm={runGenerate}
        onCancel={() => setGenerateOpen(false)}
      />
    </>
  );
}
