import Link from "next/link";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

type UnpaidRow = {
  case_id: number;
  case_number: string;
  case_name: string;
  invoice_amount: number;
  tax_rate: number;
  updated_at: string;
};

function totalWithTax(row: UnpaidRow): number {
  const tax = Math.floor((row.invoice_amount * row.tax_rate) / 100);
  return row.invoice_amount + tax;
}

export function UnpaidTable({ rows }: { rows: UnpaidRow[] }) {
  // 既定は金額（税込）降順。回収優先度の高い案件を上に。see: DESIGN.md §8.4
  const sorted = [...rows].sort((a, b) => totalWithTax(b) - totalWithTax(a));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-s">
        <div className="flex items-baseline gap-s">
          <CardTitle>請求済み未入金</CardTitle>
          <span className="text-s text-text-grey tabular-nums">全 {rows.length} 件</span>
        </div>
        <Link href="/cases" className="ui-link text-s">
          すべて見る
        </Link>
      </CardHeader>
      <CardBody className="p-0">
        {sorted.length === 0 ? (
          <p className="px-m py-m text-s text-text-grey">未入金の案件はありません。</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>案件番号</TH>
                <TH>案件名</TH>
                <TH numeric>請求金額（税込）</TH>
                <TH numeric>経過日数</TH>
              </TR>
            </THead>
            <TBody>
              {sorted.map((row) => {
                const elapsed = elapsedDays(row.updated_at);
                return (
                  <TR key={row.case_id}>
                    <TD>
                      <Link href={`/cases/${row.case_id}`} className="ui-link whitespace-nowrap">
                        {row.case_number}
                      </Link>
                    </TD>
                    <TD>{row.case_name}</TD>
                    <TD numeric>{totalWithTax(row).toLocaleString("ja-JP")} 円</TD>
                    <TD numeric className={elapsed >= 30 ? "font-medium text-danger" : undefined}>
                      {elapsed} 日
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

function elapsedDays(isoTs: string): number {
  const updatedAt = new Date(isoTs);
  const now = new Date();
  const diffMs = now.getTime() - updatedAt.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
