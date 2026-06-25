import Link from "next/link";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SortHeader } from "@/components/common/sort-header";
import { Badge } from "@/components/ui/badge";
import { formatTokyoDateTime } from "@/lib/date-time";
import type { DocumentHistoryListRow } from "@/server/documents";

type Props = {
  items: Array<DocumentHistoryListRow & { case_number?: string }>;
  showCaseNumber?: boolean;
  sortable?: boolean;
};

export function DocumentHistoryTable({ items, showCaseNumber, sortable }: Props) {
  if (items.length === 0) {
    return <p className="text-m text-text-grey py-l text-center">帳票履歴がありません。</p>;
  }

  return (
    <Table>
      <THead sticky>
        <TR>
          {showCaseNumber &&
            (sortable ? (
              <SortHeader column="case_number" label="案件番号" className="w-[150px]" />
            ) : (
              <TH className="w-[150px]">案件番号</TH>
            ))}
          <TH>テンプレート</TH>
          {sortable ? <SortHeader column="file_name" label="ファイル名" /> : <TH>ファイル名</TH>}
          <TH className="w-[120px]">形式</TH>
          {sortable ? (
            <SortHeader column="version" label="バージョン" numeric className="w-[120px]" />
          ) : (
            <TH numeric className="w-[120px]">
              バージョン
            </TH>
          )}
          {sortable ? (
            <SortHeader column="created_at" label="生成日時" className="w-[170px]" />
          ) : (
            <TH className="w-[170px]">生成日時</TH>
          )}
          <TH className="w-[124px]">操作</TH>
        </TR>
      </THead>
      <TBody>
        {items.map((row) => (
          <TR key={row.id}>
            {showCaseNumber && (
              <TD className="tabular-nums">
                <Link href={`/cases/${row.case_id}`} className="ui-link">
                  {row.case_number}
                </Link>
              </TD>
            )}
            <TD>{row.template_name}</TD>
            <TD className="text-s max-w-[320px] truncate text-text-grey" title={row.file_name}>
              {row.file_name}
            </TD>
            <TD>
              <Badge tone="neutral">.{row.file_type}</Badge>
            </TD>
            <TD numeric>v{row.version}</TD>
            <TD className="tabular-nums whitespace-nowrap text-text-grey">
              {formatTokyoDateTime(row.created_at)}
            </TD>
            <TD>
              <a
                href={`/api/documents/${row.id}/download`}
                download={row.file_name}
                aria-label={`${row.file_name} をダウンロード`}
                title="ダウンロード"
                className={buttonVariants({
                  variant: "secondary",
                  size: "sm",
                  className: "h-8 w-8 px-0",
                })}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </a>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
