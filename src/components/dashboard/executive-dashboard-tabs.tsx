"use client";

import { useMemo, useState } from "react";
import { BarChart3, LineChart, PieChart, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DashboardCards, type MonthlyTrendRow } from "@/components/dashboard/cards";
import { EmployeeSalesTable, type EmployeeSalesRow } from "./employee-sales-table";
import { MonthlyChart } from "./monthly-chart";
import { OverdueTable } from "./overdue-table";
import { UnpaidTable } from "./unpaid-table";
import { cn } from "@/lib/cn";
import type {
  CompositionRow,
  DashboardSummary,
  ExecutiveDashboardData,
  SalesBreakdownRow,
} from "@/server/dashboard";

type Variant = "operations" | "executive" | "ledger";
type CompositionMode = "client" | "industry";
type SalesMode = "case" | "client" | "area";

type Props = {
  summary: DashboardSummary;
  monthlyRows: MonthlyTrendRow[];
  overdueRows: React.ComponentProps<typeof OverdueTable>["rows"];
  unpaidRows: React.ComponentProps<typeof UnpaidTable>["rows"];
  employeeRows: EmployeeSalesRow[];
  employeeMonth: string;
  asOf: string;
  executiveData: ExecutiveDashboardData;
};

const VARIANTS: Array<{ key: Variant; label: string; description: string }> = [
  { key: "operations", label: "現場運用", description: "案件・期限" },
  { key: "executive", label: "経営指標", description: "受注・売上" },
  { key: "ledger", label: "売上台帳", description: "案件別" },
];

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-8)",
  "var(--color-warning)",
];

const CHART_H = 160;
const CHART_W = 520;
const PAD = { top: 16, right: 16, bottom: 32, left: 48 };

export function ExecutiveDashboardTabs({
  summary,
  monthlyRows,
  overdueRows,
  unpaidRows,
  employeeRows,
  employeeMonth,
  asOf,
  executiveData,
}: Props) {
  const [variant, setVariant] = useState<Variant>("operations");

  return (
    <div className="space-y-m">
      <div className="flex flex-wrap gap-s" role="tablist" aria-label="ダッシュボード表示">
        {VARIANTS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={variant === item.key}
            onClick={() => setVariant(item.key)}
            className={cn(
              "inline-flex h-8 items-center gap-xs rounded-full border px-m text-s font-semibold transition-colors",
              variant === item.key
                ? "border-main bg-white text-main shadow-s"
                : "border-border bg-white text-text-grey hover:border-border-strong hover:text-text-black",
            )}
          >
            <span>{item.label}</span>
            <span className="text-xs font-medium text-text-quaternary">{item.description}</span>
          </button>
        ))}
      </div>

      {variant === "operations" && (
        <div className="space-y-m">
          <DashboardCards data={summary} monthly={monthlyRows} asOf={asOf} />
          <div className="grid gap-m xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <EmployeeSalesTable month={employeeMonth} rows={employeeRows} />
            <OverdueTable rows={overdueRows} />
          </div>
          <UnpaidTable rows={unpaidRows} />
          <MonthlyChart rows={monthlyRows} />
        </div>
      )}

      {variant === "executive" && (
        <div className="space-y-m">
          <div className="grid gap-m xl:grid-cols-2">
            <WorkCategorySalesCard rows={executiveData.workCategorySales} />
            <OverallSalesLineCard rows={executiveData.overallSales} />
          </div>
          <div className="grid gap-m xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <CompositionCard
              clientRows={executiveData.clientComposition}
              industryRows={executiveData.industryComposition}
            />
            <ClientMonthlyAnalysis rows={executiveData.clientMonthly} />
          </div>
          <MonthlyChart rows={monthlyRows} />
        </div>
      )}

      {variant === "ledger" && (
        <div className="space-y-m">
          <SalesBreakdownCard
            byCase={executiveData.salesByCase}
            byClient={executiveData.salesByClient}
            byArea={executiveData.salesByAreaCategory}
          />
          <div className="grid gap-m xl:grid-cols-2">
            <OutsourcingCostCard />
            <UnpaidTable rows={unpaidRows} />
          </div>
          <EmployeeSalesTable month={employeeMonth} rows={employeeRows} />
        </div>
      )}
    </div>
  );
}

function WorkCategorySalesCard({ rows }: { rows: ExecutiveDashboardData["workCategorySales"] }) {
  const maxValue = Math.max(...rows.flatMap((row) => [row.order_amount, row.sales_amount]), 1);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-s">
        <CardTitle>業務別 受注・売上</CardTitle>
        <BarChart3 size={16} className="text-text-grey" aria-hidden="true" />
      </CardHeader>
      <CardBody>
        <div className="space-y-m">
          {rows.map((row) => (
            <div key={row.category} className="space-y-xs">
              <div className="flex items-center justify-between gap-s text-s">
                <span className="font-medium text-text-black">{row.category}</span>
                <span className="text-text-grey">
                  受注 {formatYen(row.order_amount)} / 売上 {formatYen(row.sales_amount)}
                </span>
              </div>
              <div className="grid gap-xs">
                <MetricBar
                  label="受注"
                  value={row.order_amount}
                  maxValue={maxValue}
                  color={COLORS[0]}
                />
                <MetricBar
                  label="売上"
                  value={row.sales_amount}
                  maxValue={maxValue}
                  color={COLORS[1]}
                />
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function MetricBar({
  label,
  value,
  maxValue,
  color,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string | undefined;
}) {
  const width = Math.max(2, Math.round((value / maxValue) * 100));
  return (
    <div className="grid grid-cols-[4em_minmax(0,1fr)_7em] items-center gap-s text-xs">
      <span className="text-text-grey">{label}</span>
      <div className="h-3 rounded-full bg-grey-7">
        <div
          className="h-3 rounded-full"
          style={{ width: `${width}%`, backgroundColor: color ?? COLORS[0] }}
        />
      </div>
      <span className="text-right tabular-nums text-text-grey">{formatYen(value)}</span>
    </div>
  );
}

function OverallSalesLineCard({ rows }: { rows: ExecutiveDashboardData["overallSales"] }) {
  const maxValue = Math.max(...rows.map((row) => row.sales_amount), 1);
  const innerW = CHART_W - PAD.left - PAD.right;
  const scaleY = (value: number) => PAD.top + CHART_H - (value / maxValue) * CHART_H;
  const xOf = (index: number) => PAD.left + (innerW / Math.max(rows.length - 1, 1)) * index;
  const points = rows.map((row, index) => `${xOf(index)},${scaleY(row.sales_amount)}`).join(" ");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-s">
        <CardTitle>全体売上推移</CardTitle>
        <LineChart size={16} className="text-text-grey" aria-hidden="true" />
      </CardHeader>
      <CardBody>
        <div className="overflow-x-auto">
          <svg
            width={CHART_W}
            height={CHART_H + PAD.top + PAD.bottom}
            role="img"
            aria-label="過去12ヶ月の全体売上の折れ線グラフ"
          >
            <g>
              {[0, 0.5, 1].map((ratio) => {
                const y = PAD.top + CHART_H - CHART_H * ratio;
                return (
                  <g key={ratio}>
                    <line
                      x1={PAD.left}
                      y1={y}
                      x2={CHART_W - PAD.right}
                      y2={y}
                      stroke="var(--color-border)"
                    />
                    <text
                      x={PAD.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize={10}
                      fill="var(--color-text-grey)"
                    >
                      {formatShortYen(maxValue * ratio)}
                    </text>
                  </g>
                );
              })}
              <polyline points={points} fill="none" stroke={COLORS[0]} strokeWidth={2} />
              {rows.map((row, index) => (
                <g key={row.year_month}>
                  <circle cx={xOf(index)} cy={scaleY(row.sales_amount)} r={3} fill={COLORS[0]}>
                    <title>{`${row.year_month} ${formatYen(row.sales_amount)}`}</title>
                  </circle>
                  <text
                    x={xOf(index)}
                    y={PAD.top + CHART_H + 20}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--color-text-grey)"
                  >
                    {row.year_month.slice(5)}月
                  </text>
                </g>
              ))}
            </g>
          </svg>
        </div>
      </CardBody>
    </Card>
  );
}

function CompositionCard({
  clientRows,
  industryRows,
}: {
  clientRows: CompositionRow[];
  industryRows: CompositionRow[];
}) {
  const [mode, setMode] = useState<CompositionMode>("client");
  const rows = mode === "client" ? clientRows : industryRows;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-s">
        <CardTitle>構成比</CardTitle>
        <PieChart size={16} className="text-text-grey" aria-hidden="true" />
      </CardHeader>
      <CardBody>
        <div className="mb-m flex flex-wrap gap-xs">
          <Button
            type="button"
            variant={mode === "client" ? "secondary" : "text"}
            size="sm"
            onClick={() => setMode("client")}
          >
            取引先
          </Button>
          <Button
            type="button"
            variant={mode === "industry" ? "secondary" : "text"}
            size="sm"
            onClick={() => setMode("industry")}
          >
            業種
          </Button>
        </div>
        <div className="grid gap-m md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
          <PieSvg rows={rows} />
          <div className="space-y-xs">
            {rows.slice(0, 6).map((row, index) => (
              <div
                key={row.label}
                className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-s text-s"
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="truncate text-text-black">{row.label}</span>
                <span className="tabular-nums text-text-grey">{formatPercent(row.ratio)}</span>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="text-s text-text-grey">集計対象の売上がありません。</p>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function PieSvg({ rows }: { rows: CompositionRow[] }) {
  const circumference = 2 * Math.PI * 42;
  let offset = 0;

  if (rows.length === 0) {
    return (
      <svg width={120} height={120} viewBox="0 0 120 120" role="img" aria-label="構成比データなし">
        <circle cx={60} cy={60} r={42} fill="none" stroke="var(--color-border)" strokeWidth={18} />
      </svg>
    );
  }

  return (
    <svg width={120} height={120} viewBox="0 0 120 120" role="img" aria-label="構成比の円グラフ">
      {rows.map((row, index) => {
        const dash = row.ratio * circumference;
        const segment = (
          <circle
            key={row.label}
            cx={60}
            cy={60}
            r={42}
            fill="none"
            stroke={COLORS[index % COLORS.length]}
            strokeWidth={18}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
          >
            <title>{`${row.label} ${formatPercent(row.ratio)}`}</title>
          </circle>
        );
        offset += dash;
        return segment;
      })}
      <circle cx={60} cy={60} r={26} fill="white" />
    </svg>
  );
}

function ClientMonthlyAnalysis({ rows }: { rows: ExecutiveDashboardData["clientMonthly"] }) {
  const clients = useMemo(
    () => [...new Set(rows.map((row) => row.client))].sort((a, b) => a.localeCompare(b, "ja")),
    [rows],
  );
  const [selectedClient, setSelectedClient] = useState<string>(clients[0] ?? "");
  const selectedRows = rows.filter((row) => row.client === selectedClient);

  return (
    <Card>
      <CardHeader>
        <CardTitle>業者ごとの受注月分析</CardTitle>
      </CardHeader>
      <CardBody className="grid gap-m lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="max-h-80 overflow-auto border border-border">
          {clients.length === 0 ? (
            <p className="p-m text-s text-text-grey">集計対象の取引先がありません。</p>
          ) : (
            clients.map((client) => (
              <button
                key={client}
                type="button"
                onClick={() => setSelectedClient(client)}
                className={cn(
                  "block w-full border-b border-border px-m py-s text-left text-s",
                  client === selectedClient
                    ? "bg-main-soft text-main"
                    : "bg-white text-text-black hover:bg-grey-5",
                )}
              >
                {client}
              </button>
            ))
          )}
        </div>
        <Table>
          <THead>
            <TR>
              <TH>月</TH>
              <TH numeric>受注</TH>
              <TH numeric>売上</TH>
            </TR>
          </THead>
          <TBody>
            {selectedRows.map((row) => (
              <TR key={`${row.client}-${row.year_month}`}>
                <TD>{row.year_month}</TD>
                <TD numeric>{formatYen(row.order_amount)}</TD>
                <TD numeric>{formatYen(row.sales_amount)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardBody>
    </Card>
  );
}

function SalesBreakdownCard({
  byCase,
  byClient,
  byArea,
}: {
  byCase: SalesBreakdownRow[];
  byClient: SalesBreakdownRow[];
  byArea: SalesBreakdownRow[];
}) {
  const [mode, setMode] = useState<SalesMode>("case");
  const rows = mode === "case" ? byCase : mode === "client" ? byClient : byArea;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-s">
        <CardTitle>売上</CardTitle>
        <Table2 size={16} className="text-text-grey" aria-hidden="true" />
      </CardHeader>
      <CardBody>
        <div className="mb-m flex flex-wrap gap-xs">
          <Button
            type="button"
            size="sm"
            variant={mode === "case" ? "secondary" : "text"}
            onClick={() => setMode("case")}
          >
            案件ごと
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "client" ? "secondary" : "text"}
            onClick={() => setMode("client")}
          >
            依頼主ごと
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "area" ? "secondary" : "text"}
            onClick={() => setMode("area")}
          >
            エリア・区分
          </Button>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>対象</TH>
              <TH>補足</TH>
              <TH numeric>件数</TH>
              <TH numeric>受注</TH>
              <TH numeric>売上</TH>
              <TH numeric>未収</TH>
            </TR>
          </THead>
          <TBody>
            {rows.slice(0, 20).map((row) => (
              <TR key={`${mode}-${row.label}`}>
                <TD>{row.label}</TD>
                <TD className="text-text-grey">{row.subLabel}</TD>
                <TD numeric>{row.case_count.toLocaleString("ja-JP")}</TD>
                <TD numeric>{formatYen(row.order_amount)}</TD>
                <TD numeric>{formatYen(row.sales_amount)}</TD>
                <TD numeric className={row.outstanding_amount > 0 ? "text-danger" : undefined}>
                  {formatYen(row.outstanding_amount)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardBody>
    </Card>
  );
}

function OutsourcingCostCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>外注費</CardTitle>
      </CardHeader>
      <CardBody>
        <Table>
          <THead>
            <TR>
              <TH>外注先</TH>
              <TH numeric>全体</TH>
              <TH numeric>個別</TH>
              <TH numeric>月別</TH>
            </TR>
          </THead>
          <TBody>
            <TR>
              <TD className="text-text-grey">外注費データ未登録</TD>
              <TD numeric>—</TD>
              <TD numeric>—</TD>
              <TD numeric>—</TD>
            </TR>
          </TBody>
        </Table>
        <p className="mt-s text-xs text-text-grey">
          外注費は入力元のテーブル追加後に、外注先一覧と月別集計を接続します。
        </p>
      </CardBody>
    </Card>
  );
}

function formatYen(value: number): string {
  return `¥${Math.round(value || 0).toLocaleString("ja-JP")}`;
}

function formatShortYen(value: number): string {
  if (value >= 100000000) return `${Math.round(value / 100000000)}億`;
  if (value >= 10000) return `${Math.round(value / 10000)}万`;
  return String(Math.round(value));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
