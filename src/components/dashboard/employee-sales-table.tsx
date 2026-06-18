"use client";

import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export type EmployeeSalesRow = {
  sale_date: string;
  assigned_user_id: string | null;
  employee_name: string;
  case_count: number;
  invoice_amount: number;
  paid_amount: number;
};

type EmployeeSubtotal = {
  employee_name: string;
  case_count: number;
  invoice_amount: number;
  paid_amount: number;
};

export function EmployeeSalesTable({
  month,
  rows,
}: {
  month: string;
  rows: EmployeeSalesRow[];
}) {
  const router = useRouter();

  const totals = rows.reduce(
    (acc, row) => ({
      case_count: acc.case_count + row.case_count,
      invoice_amount: acc.invoice_amount + row.invoice_amount,
      paid_amount: acc.paid_amount + row.paid_amount,
    }),
    { case_count: 0, invoice_amount: 0, paid_amount: 0 },
  );

  const subtotals = computeSubtotals(rows);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-s">
        <div className="flex items-baseline gap-s">
          <CardTitle>担当者別 売上（日別・入金日ベース）</CardTitle>
          <span className="text-s text-text-grey tabular-nums">全 {rows.length} 件</span>
        </div>
        <label className="flex items-center gap-xs text-s text-text-grey">
          表示月
          <input
            type="month"
            value={month}
            onChange={(e) => {
              const value = e.target.value;
              router.push(value ? `/?month=${value}` : "/");
            }}
            className="h-8 rounded-s border border-border bg-white px-s text-s text-text-black focus:border-main"
          />
        </label>
      </CardHeader>
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <p className="px-m py-m text-s text-text-grey">この月の入金実績はありません。</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>入金日</TH>
                <TH>担当者</TH>
                <TH numeric>件数</TH>
                <TH numeric>請求額</TH>
                <TH numeric>入金額</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row, index) => (
                <TR key={`${row.sale_date}-${row.assigned_user_id ?? "none"}-${index}`}>
                  <TD className="whitespace-nowrap">{formatDate(row.sale_date)}</TD>
                  <TD>{row.employee_name}</TD>
                  <TD numeric>{row.case_count.toLocaleString("ja-JP")}</TD>
                  <TD numeric>{formatYen(row.invoice_amount)}</TD>
                  <TD numeric className="font-medium">{formatYen(row.paid_amount)}</TD>
                </TR>
              ))}
            </TBody>
            <tfoot className="border-t border-border bg-head">
              {subtotals.map((sub) => (
                <tr key={`subtotal-${sub.employee_name}`} className="border-b border-border">
                  <TD className="text-text-grey">小計</TD>
                  <TD className="text-text-grey">{sub.employee_name}</TD>
                  <TD numeric className="text-text-grey">
                    {sub.case_count.toLocaleString("ja-JP")}
                  </TD>
                  <TD numeric className="text-text-grey">{formatYen(sub.invoice_amount)}</TD>
                  <TD numeric className="text-text-grey">{formatYen(sub.paid_amount)}</TD>
                </tr>
              ))}
              <tr>
                <TD className="font-semibold">合計</TD>
                <TD className="text-text-grey">—</TD>
                <TD numeric className="font-semibold">
                  {totals.case_count.toLocaleString("ja-JP")}
                </TD>
                <TD numeric className="font-semibold">{formatYen(totals.invoice_amount)}</TD>
                <TD numeric className="font-bold">{formatYen(totals.paid_amount)}</TD>
              </tr>
            </tfoot>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function computeSubtotals(rows: EmployeeSalesRow[]): EmployeeSubtotal[] {
  const map = new Map<string, EmployeeSubtotal>();
  for (const row of rows) {
    const key = row.assigned_user_id ?? `name:${row.employee_name}`;
    const current = map.get(key);
    if (current) {
      current.case_count += row.case_count;
      current.invoice_amount += row.invoice_amount;
      current.paid_amount += row.paid_amount;
    } else {
      map.set(key, {
        employee_name: row.employee_name,
        case_count: row.case_count,
        invoice_amount: row.invoice_amount,
        paid_amount: row.paid_amount,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.paid_amount - a.paid_amount);
}

function formatYen(value: number): string {
  return `¥${(value ?? 0).toLocaleString("ja-JP")}`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${y}/${m}/${d}`;
}
