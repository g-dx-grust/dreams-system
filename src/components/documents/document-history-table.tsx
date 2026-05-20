import { Download } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { DocumentHistoryListRow } from "@/server/documents";

type Props = {
  items: Array<DocumentHistoryListRow & { case_number?: string }>;
  showCaseNumber?: boolean;
};

export function DocumentHistoryTable({ items, showCaseNumber }: Props) {
  if (items.length === 0) {
    return <p className="text-m text-text-grey py-l text-center">帳票履歴がありません。</p>;
  }

  return (
    <Table>
      <THead>
        <TR>
          {showCaseNumber && <TH>案件番号</TH>}
          <TH>テンプレート</TH>
          <TH>ファイル名</TH>
          <TH>形式</TH>
          <TH>バージョン</TH>
          <TH>生成日時</TH>
          <TH></TH>
        </TR>
      </THead>
      <TBody>
        {items.map((row) => (
          <TR key={row.id}>
            {showCaseNumber && <TD>{row.case_number}</TD>}
            <TD>{row.template_name}</TD>
            <TD className="text-s max-w-[320px] truncate text-text-grey" title={row.file_name}>
              {row.file_name}
            </TD>
            <TD>
              <Badge tone="neutral">.{row.file_type}</Badge>
            </TD>
            <TD>v{row.version}</TD>
            <TD>{formatDate(row.created_at)}</TD>
            <TD>
              <a
                href={`/api/documents/${row.id}/download`}
                download={row.file_name}
                className="ui-link inline-flex items-center gap-xs text-s font-semibold"
              >
                <Download size={16} />
                DL
              </a>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
