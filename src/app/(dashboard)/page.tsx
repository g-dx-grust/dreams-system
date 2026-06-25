import { createClient } from "@/lib/supabase/server";
import { CalendarDays } from "lucide-react";
import { getCurrentUser } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { DashboardCards } from "@/components/dashboard/cards";
import { OverdueTable } from "@/components/dashboard/overdue-table";
import { type EmployeeSalesRow } from "@/components/dashboard/employee-sales-table";
import { ExecutiveDashboardTabs } from "@/components/dashboard/executive-dashboard-tabs";
import { getDashboardSummary, getExecutiveDashboardData } from "@/server/dashboard";

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

function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-");
  if (!year || !monthNumber) return month;
  return `${year}年${monthNumber}月`;
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

  const [summary, overdueRes] = await Promise.all([
    getDashboardSummary(),
    supabase.rpc("dashboard_overdue_cases", { p_limit: 20 }),
  ]);

  const overdueRows = overdueRes.data ?? [];

  if (!isAdmin) {
    return (
      <>
        <PageHeader
          title="ダッシュボード"
          description="案件の進捗状況や売上、期限情報をまとめて確認できます。"
          actions={<MonthBadge month={month} />}
        />
        <div className="space-y-m">
          <DashboardCards data={summary} monthly={[]} asOf={asOfLabel()} />
          <OverdueTable rows={overdueRows} />
        </div>
      </>
    );
  }

  const [unpaidRes, monthlyRes, employeeRes, executiveData] = await Promise.all([
    supabase.rpc("dashboard_unpaid_cases", { p_limit: 20 }),
    supabase.rpc("dashboard_monthly_stats"),
    supabase.rpc("dashboard_employee_daily_sales", { p_month: month }),
    getExecutiveDashboardData(),
  ]);

  const employeeRows = (employeeRes.data ?? []) as EmployeeSalesRow[];
  const monthlyRows = monthlyRes.data ?? [];

  return (
    <>
      <PageHeader
        title="ダッシュボード"
        description="案件の進捗状況や売上、期限情報をまとめて確認できます。"
        actions={<MonthBadge month={month} />}
      />
      <ExecutiveDashboardTabs
        summary={summary}
        monthlyRows={monthlyRows}
        overdueRows={overdueRows}
        unpaidRows={unpaidRes.data ?? []}
        employeeRows={employeeRows}
        employeeMonth={month}
        asOf={asOfLabel()}
        executiveData={executiveData}
      />
    </>
  );
}

function MonthBadge({ month }: { month: string }) {
  return (
    <div className="inline-flex h-10 items-center gap-s rounded-l border border-border bg-white px-m text-s font-semibold text-text-black shadow-s">
      <span className="tabular-nums">{formatMonthLabel(month)}</span>
      <CalendarDays className="h-4 w-4 text-text-grey" aria-hidden="true" />
    </div>
  );
}
