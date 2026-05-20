import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { DashboardCards } from "@/components/dashboard/cards";
import { OverdueTable } from "@/components/dashboard/overdue-table";
import { UnpaidTable } from "@/components/dashboard/unpaid-table";
import { MonthlyChart } from "@/components/dashboard/monthly-chart";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [summaryRes, overdueRes, unpaidRes, monthlyRes] = await Promise.all([
    supabase.rpc("dashboard_summary"),
    supabase.rpc("dashboard_overdue_cases", { p_limit: 20 }),
    supabase.rpc("dashboard_unpaid_cases", { p_limit: 20 }),
    supabase.rpc("dashboard_monthly_stats"),
  ]);

  return (
    <>
      <PageHeader title="ダッシュボード" />
      <div className="space-y-l">
        <DashboardCards data={summaryRes.data} />
        <OverdueTable rows={overdueRes.data ?? []} />
        <UnpaidTable rows={unpaidRes.data ?? []} />
        <MonthlyChart rows={monthlyRes.data ?? []} />
      </div>
    </>
  );
}
