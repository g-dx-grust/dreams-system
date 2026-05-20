import Link from "next/link";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CaseStatusLabels } from "@/lib/validators/case";

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
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>期限超過・期限間近の案件</CardTitle>
        <Link href="/cases?filter=overdue" className="ui-link text-s">
          すべて見る
        </Link>
      </CardHeader>
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <p className="px-l py-m text-s text-text-grey">該当案件はありません。</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>案件番号</TH>
                <TH>案件名</TH>
                <TH>担当者</TH>
                <TH>締切日</TH>
                <TH>ステータス</TH>
                <TH className="text-right">残日数</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <Link href={`/cases/${row.id}`} className="ui-link whitespace-nowrap">
                      {row.case_number}
                    </Link>
                  </TD>
                  <TD>{row.case_name}</TD>
                  <TD className="text-text-grey">{row.assigned_user ?? "—"}</TD>
                  <TD className="whitespace-nowrap">{formatDate(row.deadline_date)}</TD>
                  <TD>
                    <span className="text-xs text-text-grey">
                      {(CaseStatusLabels as Record<string, string>)[row.status] ?? row.status}
                    </span>
                  </TD>
                  <TD className="text-right whitespace-nowrap">
                    <span
                      className={row.days_remaining < 0 ? "font-medium text-danger" : "text-chart-4"}
                    >
                      {row.days_remaining < 0
                        ? `${row.days_remaining}日`
                        : `残${row.days_remaining}日`}
                    </span>
                  </TD>
                </TR>
              ))}
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
