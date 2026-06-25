import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
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
  const dueSoonHref = `/cases?deadline_to=${dateAfterDays(7)}`;

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
      href: "/cases?overdue=1",
      tone: d.overdue > 0 ? "danger" : "neutral",
      delta: null,
      ratio: null,
    },
    {
      label: "期限間近（7日以内）",
      value: d.due_soon,
      unit: "件",
      href: dueSoonHref,
      tone: d.due_soon > 0 ? "warning" : "neutral",
      delta: null,
      ratio: null,
    },
  ];

  return (
    <section aria-label="案件サマリ">
      <Card className="border-border-strong">
        <div className="grid lg:grid-cols-4">
          <div className="bg-grust-navy px-m py-m text-white lg:col-span-1">
            <p className="text-xs font-semibold text-white/70">本日の要対応</p>
            <p className="mt-xs text-xxl font-semibold leading-none tabular-nums">
              {(d.overdue + d.due_soon).toLocaleString("ja-JP")}
              <span className="ml-xs text-s font-normal text-white/70">件</span>
            </p>
            <div className="mt-m grid grid-cols-2 gap-s">
              <Link
                href="/cases?overdue=1"
                className="rounded-s border border-white/20 bg-white/10 px-s py-s text-white transition-colors hover:bg-white/20"
              >
                <span className="block text-xs text-white/70">期限超過</span>
                <span className="mt-xxs block text-l font-semibold tabular-nums">
                  {d.overdue.toLocaleString("ja-JP")} 件
                </span>
              </Link>
              <Link
                href={dueSoonHref}
                className="rounded-s border border-white/20 bg-white/10 px-s py-s text-white transition-colors hover:bg-white/20"
              >
                <span className="block text-xs text-white/70">7日以内</span>
                <span className="mt-xxs block text-l font-semibold tabular-nums">
                  {d.due_soon.toLocaleString("ja-JP")} 件
                </span>
              </Link>
            </div>
            <p className="mt-m text-xs text-white/60 tabular-nums">集計時点: {asOf}</p>
          </div>

          <div className="lg:col-span-3">
            <CardHeader className="flex flex-wrap items-center justify-between gap-s">
              <CardTitle>案件サマリ</CardTitle>
              <p className="text-xs text-text-quaternary">主要指標</p>
            </CardHeader>
            <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric, index) => (
                <MetricCell
                  key={metric.label}
                  metric={metric}
                  isNewCases={index === 0}
                  isCompleted={index === 1}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>
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
    <Link href={metric.href} className="block bg-white p-m transition-colors hover:bg-grey-5">
      <div className="flex items-center justify-between gap-s">
        <p className="text-s font-medium text-text-grey">{metric.label}</p>
        {metric.tone !== "neutral" && <Badge tone={metric.tone}>要対応</Badge>}
      </div>
      <p className="mt-xs text-xl font-semibold leading-tight tabular-nums text-text-black">
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

function dateAfterDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
