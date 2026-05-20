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

export function UnpaidTable({ rows }: { rows: UnpaidRow[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>請求済み未入金</CardTitle>
        <Link href="/cases" className="ui-link text-s">
          すべて見る
        </Link>
      </CardHeader>
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <p className="px-l py-m text-s text-text-grey">未入金の案件はありません。</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>案件番号</TH>
                <TH>案件名</TH>
                <TH className="text-right">請求金額（税込）</TH>
                <TH className="text-right">経過日数</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => {
                const elapsed = elapsedDays(row.updated_at);
                const taxAmount = Math.floor((row.invoice_amount * row.tax_rate) / 100);
                const totalAmount = row.invoice_amount + taxAmount;
                return (
                  <TR key={row.case_id}>
                    <TD>
                      <Link href={`/cases/${row.case_id}`} className="ui-link whitespace-nowrap">
                        {row.case_number}
                      </Link>
                    </TD>
                    <TD>{row.case_name}</TD>
                    <TD className="text-right whitespace-nowrap">
                      {totalAmount.toLocaleString("ja-JP")} 円
                    </TD>
                    <TD
                      className={`text-right whitespace-nowrap ${elapsed >= 30 ? "font-medium text-danger" : ""}`}
                    >
                      {elapsed}日
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
