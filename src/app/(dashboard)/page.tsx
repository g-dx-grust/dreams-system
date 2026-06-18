import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { DashboardCards } from "@/components/dashboard/cards";
import { OverdueTable } from "@/components/dashboard/overdue-table";
import { UnpaidTable } from "@/components/dashboard/unpaid-table";
import { MonthlyChart } from "@/components/dashboard/monthly-chart";
import {
  EmployeeSalesTable,
  type EmployeeSalesRow,
} from "@/components/dashboard/employee-sales-table";

function currentMonth(): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

function normalizeMonth(raw: string | undefined): string {
  return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonth();
}

function asOfLabel(): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";
  const { month: monthParam } = await searchParams;
  const month = normalizeMonth(monthParam);

  const [summaryRes, overdueRes, unpaidRes, monthlyRes] = await Promise.all([
    supabase.rpc("dashboard_summary"),
    supabase.rpc("dashboard_overdue_cases", { p_limit: 20 }),
    supabase.rpc("dashboard_unpaid_cases", { p_limit: 20 }),
    supabase.rpc("dashboard_monthly_stats"),
  ]);

  let employeeRows: EmployeeSalesRow[] = [];
  if (isAdmin) {
    const employeeRes = await supabase.rpc("dashboard_employee_daily_sales", {
      p_month: month,
    });
    employeeRows = (employeeRes.data ?? []) as EmployeeSalesRow[];
  }

  const monthlyRows = monthlyRes.data ?? [];

  return (
    <>
      <PageHeader title="ダッシュボード" />
      <div className="space-y-m">
        <DashboardCards data={summaryRes.data} monthly={monthlyRows} asOf={asOfLabel()} />
        {isAdmin && <EmployeeSalesTable month={month} rows={employeeRows} />}
        <OverdueTable rows={overdueRes.data ?? []} />
        <UnpaidTable rows={unpaidRes.data ?? []} />
        <MonthlyChart rows={monthlyRows} />
      </div>
    </>
  );
}
