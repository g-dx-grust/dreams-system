import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type SummaryData = {
  total_cases: number;
  in_progress: number;
  overdue: number;
  due_soon: number;
  unpaid_count: number;
  unpaid_total: number;
};

export type MonthlyTrendRow = {
  year_month: string;
  new_cases: number;
  completed_cases: number;
  invoice_amount: number;
  paid_amount: number;
};

type Tone = "neutral" | "danger" | "warning";

type Metric = {
  label: string;
  value: number;
  unit: string;
  href: string;
  tone: Tone;
  delta: number | null;
  ratio: number | null;
};

const EMPTY_SUMMARY: SummaryData = {
  total_cases: 0,
  in_progress: 0,
  overdue: 0,
  due_soon: 0,
  unpaid_count: 0,
  unpaid_total: 0,
};

function deltaOf(series: number[]): { delta: number | null; ratio: number | null } {
  if (series.length < 2) return { delta: null, ratio: null };
  const current = series[series.length - 1] ?? 0;
  const previous = series[series.length - 2] ?? 0;
  const delta = current - previous;
  const ratio = previous === 0 ? null : delta / previous;
  return { delta, ratio };
}

export function DashboardCards({
  data,
  monthly,
  asOf,
}: {
  data: SummaryData | null;
  monthly: MonthlyTrendRow[];
  asOf: string;
}) {
  const d = data ?? EMPTY_SUMMARY;

  const newCasesTrend = deltaOf(monthly.map((m) => m.new_cases));
  const completedTrend = deltaOf(monthly.map((m) => m.completed_cases));

  const metrics: Metric[] = [
    {
      label: "総案件数",
      value: d.total_cases,
      unit: "件",
      href: "/cases",
      tone: "neutral",
      delta: newCasesTrend.delta,
      ratio: newCasesTrend.ratio,
    },
    {
      label: "進行中",
      value: d.in_progress,
      unit: "件",
      href: "/cases?status=in_progress",
      tone: "neutral",
      delta: completedTrend.delta,
      ratio: completedTrend.ratio,
    },
    {
      label: "期限超過",
      value: d.overdue,
      unit: "件",
      href: "/cases?filter=overdue",
      tone: d.overdue > 0 ? "danger" : "neutral",
      delta: null,
      ratio: null,
    },
    {
      label: "期限間近（7日以内）",
      value: d.due_soon,
      unit: "件",
      href: "/cases?filter=due_soon",
      tone: d.due_soon > 0 ? "warning" : "neutral",
      delta: null,
      ratio: null,
    },
  ];

  return (
    <section aria-label="案件サマリ">
      <Card>
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric, index) => (
            <MetricCell
              key={metric.label}
              metric={metric}
              isNewCases={index === 0}
              isCompleted={index === 1}
            />
          ))}
        </div>
      </Card>
      <p className="mt-xs text-xs text-text-quaternary tabular-nums">集計時点: {asOf}</p>
    </section>
  );
}

function MetricCell({
  metric,
  isNewCases,
  isCompleted,
}: {
  metric: Metric;
  isNewCases: boolean;
  isCompleted: boolean;
}) {
  const trendLabel = isNewCases ? "新規" : isCompleted ? "完了" : null;

  return (
    <Link href={metric.href} className="block bg-white p-m transition-colors hover:bg-grey-7">
      <div className="flex items-center justify-between gap-s">
        <p className="text-s font-medium text-text-grey">{metric.label}</p>
        {metric.tone !== "neutral" && <Badge tone={metric.tone}>要対応</Badge>}
      </div>
      <p className="mt-xs text-xxl font-semibold leading-tight tabular-nums text-text-black">
        {metric.value.toLocaleString("ja-JP")}
        <span className="ml-xs text-s font-normal text-text-grey">{metric.unit}</span>
      </p>
      {trendLabel !== null && (
        <p className="mt-xs text-xs text-text-grey tabular-nums">
          {trendLabel}前月比 {formatDelta(metric.delta)}
          {metric.ratio !== null && (
            <span className="text-text-quaternary">（{formatRatio(metric.ratio)}）</span>
          )}
        </p>
      )}
    </Link>
  );
}

function formatDelta(delta: number | null): string {
  if (delta === null) return "—";
  if (delta === 0) return "±0 件";
  const sign = delta > 0 ? "+" : "▲";
  return `${sign}${Math.abs(delta).toLocaleString("ja-JP")} 件`;
}

function formatRatio(ratio: number): string {
  if (ratio === 0) return "±0%";
  const pct = Math.round(Math.abs(ratio) * 100);
  const sign = ratio > 0 ? "+" : "▲";
  return `${sign}${pct}%`;
}
