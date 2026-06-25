import Link from "next/link";
import { AlertTriangle, ClipboardList, Clock3, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

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

type Tone = "main" | "info" | "warning" | "success";

type Metric = {
  label: string;
  value: number;
  unit: string;
  href: string;
  tone: Tone;
  icon: LucideIcon;
  delta: number | null;
  ratio: number | null;
  trend: number[];
  badge?: string;
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
  asOf: _asOf,
}: {
  data: SummaryData | null;
  monthly: MonthlyTrendRow[];
  asOf: string;
}) {
  const d = data ?? EMPTY_SUMMARY;
  const dueSoonHref = `/cases?deadline_to=${dateAfterDays(7)}`;

  const newCases = monthly.map((m) => m.new_cases);
  const completed = monthly.map((m) => m.completed_cases);
  const invoice = monthly.map((m) => Math.round((m.invoice_amount ?? 0) / 10000));
  const paid = monthly.map((m) => Math.round((m.paid_amount ?? 0) / 10000));
  const newCasesTrend = deltaOf(newCases);
  const completedTrend = deltaOf(completed);

  const metrics: Metric[] = [
    {
      label: "総案件数",
      value: d.total_cases,
      unit: "件",
      href: "/cases",
      tone: "main",
      icon: ClipboardList,
      delta: newCasesTrend.delta,
      ratio: newCasesTrend.ratio,
      trend: newCases,
    },
    {
      label: "進行中",
      value: d.in_progress,
      unit: "件",
      href: "/cases?status=in_progress",
      tone: "info",
      icon: Send,
      delta: completedTrend.delta,
      ratio: completedTrend.ratio,
      trend: completed,
    },
    {
      label: "期限超過",
      value: d.overdue,
      unit: "件",
      href: "/cases?overdue=1",
      tone: "warning",
      icon: AlertTriangle,
      delta: null,
      ratio: null,
      trend: invoice,
      badge: d.overdue > 0 ? "要対応" : undefined,
    },
    {
      label: "期限間近（7日以内）",
      value: d.due_soon,
      unit: "件",
      href: dueSoonHref,
      tone: "success",
      icon: Clock3,
      delta: null,
      ratio: null,
      trend: paid,
    },
  ];

  return (
    <section className="grid gap-m md:grid-cols-2 xl:grid-cols-4" aria-label="案件サマリ">
      {metrics.map((metric) => (
        <MetricCard key={metric.label} metric={metric} />
      ))}
    </section>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  const Icon = metric.icon;

  return (
    <Link href={metric.href} className="group block min-w-0">
      <Card className="h-full p-m transition-colors group-hover:border-border-strong">
        <div className="flex items-start justify-between gap-s">
          <div className="flex items-center gap-s">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                metric.tone === "main" && "border-main/20 bg-main-soft text-main",
                metric.tone === "info" && "border-main/20 bg-main-soft text-main",
                metric.tone === "warning" && "border-warning/20 bg-warning-soft text-warning",
                metric.tone === "success" && "border-success/20 bg-success-soft text-success",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-s font-semibold text-text-black">{metric.label}</p>
          </div>
          {metric.badge && <Badge tone="danger">{metric.badge}</Badge>}
        </div>

        <div className="mt-m flex items-end justify-between gap-m">
          <div className="min-w-0">
            <p className="text-xxl font-semibold leading-none text-text-black tabular-nums">
              {metric.value.toLocaleString("ja-JP")}
              <span className="ml-xs text-m font-normal text-text-grey">{metric.unit}</span>
            </p>
            <p className="mt-xs text-xs text-text-grey tabular-nums">
              前月比 {formatDelta(metric.delta)}
              {metric.ratio !== null && (
                <span className="text-text-quaternary">（{formatRatio(metric.ratio)}）</span>
              )}
            </p>
          </div>
          <Sparkline values={metric.trend} tone={metric.tone} />
        </div>
      </Card>
    </Link>
  );
}

function Sparkline({ values, tone }: { values: number[]; tone: Tone }) {
  const padded = values.length >= 2 ? values.slice(-10) : [0, ...values, 0];
  const max = Math.max(...padded, 1);
  const width = 112;
  const height = 42;
  const points = padded
    .map((value, index) => {
      const x = (width / Math.max(padded.length - 1, 1)) * index;
      const y = height - (value / max) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");
  const stroke =
    tone === "warning"
      ? "var(--color-warning)"
      : tone === "success"
        ? "var(--color-success)"
        : "var(--color-main)";

  return (
    <svg
      className="hidden shrink-0 sm:block"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="推移"
    >
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={2} />
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="var(--color-border)" />
    </svg>
  );
}

function formatDelta(delta: number | null): string {
  if (delta === null) return "±0 件";
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
