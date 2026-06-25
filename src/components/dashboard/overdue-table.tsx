import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
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
  const sorted = [...rows].sort((a, b) => a.days_remaining - b.days_remaining);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-s bg-white px-m py-m">
        <CardTitle>期限超過・期限間近の案件</CardTitle>
        <Link href="/cases?overdue=1" className="ui-link text-s font-semibold">
          すべて見る
        </Link>
      </CardHeader>
      <CardBody className="p-0">
        {sorted.length === 0 ? (
          <p className="px-m py-m text-s text-text-grey">該当案件はありません。</p>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.slice(0, 8).map((row) => {
              const overdue = row.days_remaining < 0;
              return (
                <li key={row.id}>
                  <Link
                    href={`/cases/${row.id}`}
                    className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-s px-m py-s hover:bg-grey-5"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full text-danger">
                      <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs text-text-grey tabular-nums">
                        {row.case_number}
                      </span>
                      <span className="block truncate text-s font-semibold text-text-black">
                        {row.case_name}
                      </span>
                    </span>
                    <span className="flex items-center gap-s">
                      <Badge tone={caseStatusTone(row.status)}>{caseStatusLabel(row.status)}</Badge>
                      <Badge tone={overdue ? "danger" : "warning"}>
                        {overdue
                          ? `期限超過 ${row.days_remaining} 日`
                          : `残 ${row.days_remaining} 日`}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-text-quaternary" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
