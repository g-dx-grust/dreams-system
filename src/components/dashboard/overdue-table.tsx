import Link from "next/link";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { caseStatusLabel, caseStatusTone } from "@/lib/format";

type OverdueRow = {
  id: number;
  case_number: string;
  case_name: string;
  assigned_user: string | null;
  deadline_date: string;
  status: string;
  days_remaining: number;
};

export function OverdueTable({ rows }: { rows: OverdueRow[] }) {
  // 既定は締切昇順（残日数の少ない順）。差し迫った案件を上に。see: DESIGN.md §8.4
  const sorted = [...rows].sort((a, b) => a.days_remaining - b.days_remaining);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-s">
        <div className="flex items-baseline gap-s">
          <CardTitle>期限超過・期限間近の案件</CardTitle>
          <span className="text-s text-text-grey tabular-nums">全 {rows.length} 件</span>
        </div>
        <Link href="/cases?filter=overdue" className="ui-link text-s">
          すべて見る
        </Link>
      </CardHeader>
      <CardBody className="p-0">
        {sorted.length === 0 ? (
          <p className="px-m py-m text-s text-text-grey">該当案件はありません。</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>案件番号</TH>
                <TH>案件名</TH>
                <TH>担当者</TH>
                <TH>締切日</TH>
                <TH>ステータス</TH>
                <TH numeric>残日数</TH>
              </TR>
            </THead>
            <TBody>
              {sorted.map((row) => {
                const overdue = row.days_remaining < 0;
                return (
                  <TR key={row.id}>
                    <TD>
                      <Link href={`/cases/${row.id}`} className="ui-link whitespace-nowrap">
                        {row.case_number}
                      </Link>
                    </TD>
                    <TD>{row.case_name}</TD>
                    <TD className="text-text-grey">{row.assigned_user ?? "—"}</TD>
                    <TD className="tabular-nums whitespace-nowrap">{formatDate(row.deadline_date)}</TD>
                    <TD>
                      <Badge tone={caseStatusTone(row.status)}>{caseStatusLabel(row.status)}</Badge>
                    </TD>
                    <TD numeric>
                      {overdue ? (
                        <Badge tone="danger">{row.days_remaining} 日</Badge>
                      ) : (
                        <Badge tone="warning">残 {row.days_remaining} 日</Badge>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${y}/${m}/${d}`;
}
