import Link from "next/link";
import { cn } from "@/lib/cn";
import { Card, CardBody } from "@/components/ui/card";

type SummaryData = {
  total_cases: number;
  in_progress: number;
  overdue: number;
  due_soon: number;
  unpaid_count: number;
  unpaid_total: number;
};

export function DashboardCards({ data }: { data: SummaryData | null }) {
  const d: SummaryData = data ?? {
    total_cases: 0,
    in_progress: 0,
    overdue: 0,
    due_soon: 0,
    unpaid_count: 0,
    unpaid_total: 0,
  };

  const metrics = [
    {
      label: "総案件数",
      value: d.total_cases,
      unit: "件",
      href: "/cases",
      color: "text-text-black",
    },
    {
      label: "進行中",
      value: d.in_progress,
      unit: "件",
      href: "/cases?status=in_progress",
      color: "text-main",
    },
    {
      label: "期限超過",
      value: d.overdue,
      unit: "件",
      href: "/cases?filter=overdue",
      color: "text-danger",
    },
    {
      label: "期限間近（7日以内）",
      value: d.due_soon,
      unit: "件",
      href: "/cases?filter=due_soon",
      color: "text-chart-4",
    },
  ] as const;

  return (
    <Card>
      <CardBody className="grid gap-0 p-0 lg:grid-cols-4">
        {metrics.map((metric, index) => (
          <MetricCard
            key={metric.label}
            {...metric}
            className={cn(
              index < metrics.length - 1 && "border-b border-border lg:border-b-0 lg:border-r",
            )}
          />
        ))}
      </CardBody>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  unit,
  href,
  color,
  className,
}: {
  label: string;
  value: number;
  unit: string;
  href: string;
  color: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("block px-l py-l transition-colors hover:bg-grey-6", className)}
    >
      <p className="text-s font-medium text-text-grey">{label}</p>
      <p className={`mt-s text-xl font-medium leading-tight ${color}`}>
        {value.toLocaleString("ja-JP")}
        <span className="ml-xs text-s font-normal text-text-grey">{unit}</span>
      </p>
    </Link>
  );
}
