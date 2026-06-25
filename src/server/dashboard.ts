import { createClient } from "@/lib/supabase/server";
import {
  monthKeyInTokyo,
  todayTokyoDateKey,
  tokyoDateKeyAfterDays,
  tokyoMonthKeyOffset,
} from "@/lib/date-time";
import { CaseTypeLabels } from "@/lib/validators/case";

export type DashboardSummary = {
  total_cases: number;
  in_progress: number;
  overdue: number;
  due_soon: number;
  unpaid_count: number;
  unpaid_total: number;
};

export type WorkCategorySalesRow = {
  category: "行政書士業務" | "土地業務" | "建物業務";
  order_amount: number;
  sales_amount: number;
};

export type ExecutiveMonthlySalesRow = {
  year_month: string;
  sales_amount: number;
};

export type CompositionRow = {
  label: string;
  amount: number;
  ratio: number;
};

export type ClientMonthlyRow = {
  client: string;
  year_month: string;
  order_amount: number;
  sales_amount: number;
};

export type SalesBreakdownRow = {
  label: string;
  subLabel: string;
  case_count: number;
  order_amount: number;
  sales_amount: number;
  outstanding_amount: number;
};

export type ExecutiveDashboardData = {
  workCategorySales: WorkCategorySalesRow[];
  overallSales: ExecutiveMonthlySalesRow[];
  clientComposition: CompositionRow[];
  industryComposition: CompositionRow[];
  clientMonthly: ClientMonthlyRow[];
  salesByCase: SalesBreakdownRow[];
  salesByClient: SalesBreakdownRow[];
  salesByAreaCategory: SalesBreakdownRow[];
};

type CaseDashboardRow = {
  id: number;
  case_number: string;
  case_name: string;
  case_type: string;
  status: string;
  deadline_date: string | null;
  created_at: string;
};

type FinancialDashboardRow = {
  case_id: number;
  estimate_amount: number | null;
  invoice_amount: number | null;
  paid_amount: number | null;
  paid_date: string | null;
  updated_at: string;
};

type PersonDashboardRow = {
  case_id: number;
  role: string;
  snapshot_name: string | null;
};

type ParcelDashboardRow = {
  case_id: number;
  pref: string | null;
  city: string | null;
};

const EMPTY_SUMMARY: DashboardSummary = {
  total_cases: 0,
  in_progress: 0,
  overdue: 0,
  due_soon: 0,
  unpaid_count: 0,
  unpaid_total: 0,
};

const WORK_CATEGORIES: WorkCategorySalesRow["category"][] = [
  "行政書士業務",
  "土地業務",
  "建物業務",
];

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cases")
    .select("id, status, deadline_date")
    .neq("status", "cancelled");

  if (error) return EMPTY_SUMMARY;

  const today = todayTokyoDateKey();
  const dueSoon = tokyoDateKeyAfterDays(7);
  const rows = (data ?? []) as Array<Pick<CaseDashboardRow, "status" | "deadline_date">>;

  return {
    total_cases: rows.length,
    in_progress: rows.filter((row) => row.status === "in_progress").length,
    overdue: rows.filter((row) => {
      const deadline = row.deadline_date;
      return deadline !== null && deadline < today && row.status !== "completed";
    }).length,
    due_soon: rows.filter((row) => {
      const deadline = row.deadline_date;
      return (
        deadline !== null && deadline >= today && deadline <= dueSoon && row.status !== "completed"
      );
    }).length,
    unpaid_count: 0,
    unpaid_total: 0,
  };
}

export async function getExecutiveDashboardData(): Promise<ExecutiveDashboardData> {
  const supabase = await createClient();
  const [casesRes, financialsRes, personsRes, parcelsRes] = await Promise.all([
    supabase
      .from("cases")
      .select("id, case_number, case_name, case_type, status, deadline_date, created_at")
      .neq("status", "cancelled"),
    supabase
      .from("case_financials")
      .select("case_id, estimate_amount, invoice_amount, paid_amount, paid_date, updated_at"),
    supabase.from("case_persons").select("case_id, role, snapshot_name"),
    supabase.from("case_parcels").select("case_id, pref, city").order("sort_order"),
  ]);

  if (casesRes.error || financialsRes.error || personsRes.error || parcelsRes.error) {
    return emptyExecutiveDashboardData();
  }

  const cases = (casesRes.data ?? []) as CaseDashboardRow[];
  const financialByCaseId = new Map(
    ((financialsRes.data ?? []) as FinancialDashboardRow[]).map((row) => [row.case_id, row]),
  );
  const personsByCaseId = groupBy((personsRes.data ?? []) as PersonDashboardRow[], "case_id");
  const parcelsByCaseId = groupBy((parcelsRes.data ?? []) as ParcelDashboardRow[], "case_id");

  const workCategorySales = buildWorkCategorySales(cases, financialByCaseId);
  const overallSales = buildOverallSales((financialsRes.data ?? []) as FinancialDashboardRow[]);
  const clientComposition = buildComposition(
    cases.map((caseRow) => ({
      label: clientNameOf(personsByCaseId.get(caseRow.id) ?? []),
      amount: salesAmountOf(financialByCaseId.get(caseRow.id)),
    })),
  );
  const industryComposition = buildComposition(
    cases.map((caseRow) => ({
      label: caseTypeLabel(caseRow.case_type),
      amount: salesAmountOf(financialByCaseId.get(caseRow.id)),
    })),
  );

  return {
    workCategorySales,
    overallSales,
    clientComposition,
    industryComposition,
    clientMonthly: buildClientMonthly(cases, financialByCaseId, personsByCaseId),
    salesByCase: buildSalesByCase(cases, financialByCaseId, personsByCaseId),
    salesByClient: buildSalesByClient(cases, financialByCaseId, personsByCaseId),
    salesByAreaCategory: buildSalesByAreaCategory(cases, financialByCaseId, parcelsByCaseId),
  };
}

function emptyExecutiveDashboardData(): ExecutiveDashboardData {
  return {
    workCategorySales: WORK_CATEGORIES.map((category) => ({
      category,
      order_amount: 0,
      sales_amount: 0,
    })),
    overallSales: lastTwelveMonths().map((yearMonth) => ({
      year_month: yearMonth,
      sales_amount: 0,
    })),
    clientComposition: [],
    industryComposition: [],
    clientMonthly: [],
    salesByCase: [],
    salesByClient: [],
    salesByAreaCategory: [],
  };
}

function buildWorkCategorySales(
  cases: CaseDashboardRow[],
  financialByCaseId: Map<number, FinancialDashboardRow | undefined>,
): WorkCategorySalesRow[] {
  const totals = new Map(
    WORK_CATEGORIES.map((category) => [
      category,
      { category, order_amount: 0, sales_amount: 0 } satisfies WorkCategorySalesRow,
    ]),
  );

  for (const caseRow of cases) {
    const category = workCategoryOf(caseRow.case_type);
    const current = totals.get(category);
    if (!current) continue;
    const financial = financialByCaseId.get(caseRow.id);
    current.order_amount += orderAmountOf(financial);
    current.sales_amount += financial?.paid_amount ?? 0;
  }

  return WORK_CATEGORIES.map((category) => {
    const row = totals.get(category);
    return row ?? { category, order_amount: 0, sales_amount: 0 };
  });
}

function buildOverallSales(financials: FinancialDashboardRow[]): ExecutiveMonthlySalesRow[] {
  const months = lastTwelveMonths();
  const salesByMonth = new Map(months.map((month) => [month, 0]));

  for (const financial of financials) {
    if (!financial.paid_date || financial.paid_amount == null) continue;
    const month = financial.paid_date.slice(0, 7);
    if (!salesByMonth.has(month)) continue;
    salesByMonth.set(month, (salesByMonth.get(month) ?? 0) + financial.paid_amount);
  }

  return months.map((yearMonth) => ({
    year_month: yearMonth,
    sales_amount: salesByMonth.get(yearMonth) ?? 0,
  }));
}

function buildComposition(rows: Array<{ label: string; amount: number }>): CompositionRow[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.label, (totals.get(row.label) ?? 0) + row.amount);
  }

  const total = [...totals.values()].reduce((sum, amount) => sum + amount, 0);
  return [...totals.entries()]
    .map(([label, amount]) => ({
      label,
      amount,
      ratio: total > 0 ? amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function buildClientMonthly(
  cases: CaseDashboardRow[],
  financialByCaseId: Map<number, FinancialDashboardRow | undefined>,
  personsByCaseId: Map<number, PersonDashboardRow[]>,
): ClientMonthlyRow[] {
  const rows = new Map<string, ClientMonthlyRow>();

  for (const caseRow of cases) {
    const financial = financialByCaseId.get(caseRow.id);
    const client = clientNameOf(personsByCaseId.get(caseRow.id) ?? []);
    const month = monthKeyInTokyo(new Date(caseRow.created_at));
    const key = `${client}:${month}`;
    const current =
      rows.get(key) ??
      ({ client, year_month: month, order_amount: 0, sales_amount: 0 } satisfies ClientMonthlyRow);
    current.order_amount += orderAmountOf(financial);
    current.sales_amount += financial?.paid_amount ?? 0;
    rows.set(key, current);
  }

  return [...rows.values()].sort((a, b) =>
    a.client === b.client
      ? a.year_month.localeCompare(b.year_month)
      : a.client.localeCompare(b.client, "ja"),
  );
}

function buildSalesByCase(
  cases: CaseDashboardRow[],
  financialByCaseId: Map<number, FinancialDashboardRow | undefined>,
  personsByCaseId: Map<number, PersonDashboardRow[]>,
): SalesBreakdownRow[] {
  return cases
    .map((caseRow) => {
      const financial = financialByCaseId.get(caseRow.id);
      const order = orderAmountOf(financial);
      const sales = financial?.paid_amount ?? 0;
      return {
        label: `${caseRow.case_number} ${caseRow.case_name}`,
        subLabel: clientNameOf(personsByCaseId.get(caseRow.id) ?? []),
        case_count: 1,
        order_amount: order,
        sales_amount: sales,
        outstanding_amount: Math.max(order - sales, 0),
      };
    })
    .sort((a, b) => b.order_amount - a.order_amount);
}

function buildSalesByClient(
  cases: CaseDashboardRow[],
  financialByCaseId: Map<number, FinancialDashboardRow | undefined>,
  personsByCaseId: Map<number, PersonDashboardRow[]>,
): SalesBreakdownRow[] {
  return groupSalesRows(
    cases.map((caseRow) => {
      const financial = financialByCaseId.get(caseRow.id);
      return {
        key: clientNameOf(personsByCaseId.get(caseRow.id) ?? []),
        subLabel: "依頼主",
        order_amount: orderAmountOf(financial),
        sales_amount: financial?.paid_amount ?? 0,
      };
    }),
  );
}

function buildSalesByAreaCategory(
  cases: CaseDashboardRow[],
  financialByCaseId: Map<number, FinancialDashboardRow | undefined>,
  parcelsByCaseId: Map<number, ParcelDashboardRow[]>,
): SalesBreakdownRow[] {
  return groupSalesRows(
    cases.map((caseRow) => {
      const financial = financialByCaseId.get(caseRow.id);
      const parcel = parcelsByCaseId.get(caseRow.id)?.[0];
      const area = [parcel?.pref, parcel?.city].filter(Boolean).join("") || "所在地未設定";
      return {
        key: `${area} / ${caseTypeLabel(caseRow.case_type)}`,
        subLabel: area,
        order_amount: orderAmountOf(financial),
        sales_amount: financial?.paid_amount ?? 0,
      };
    }),
  );
}

function groupSalesRows(
  rows: Array<{ key: string; subLabel: string; order_amount: number; sales_amount: number }>,
): SalesBreakdownRow[] {
  const totals = new Map<string, SalesBreakdownRow>();

  for (const row of rows) {
    const current =
      totals.get(row.key) ??
      ({
        label: row.key,
        subLabel: row.subLabel,
        case_count: 0,
        order_amount: 0,
        sales_amount: 0,
        outstanding_amount: 0,
      } satisfies SalesBreakdownRow);
    current.case_count += 1;
    current.order_amount += row.order_amount;
    current.sales_amount += row.sales_amount;
    current.outstanding_amount += Math.max(row.order_amount - row.sales_amount, 0);
    totals.set(row.key, current);
  }

  return [...totals.values()].sort((a, b) => b.order_amount - a.order_amount);
}

function groupBy<T extends Record<K, PropertyKey>, K extends keyof T>(
  rows: T[],
  key: K,
): Map<T[K], T[]> {
  const map = new Map<T[K], T[]>();
  for (const row of rows) {
    const current = map.get(row[key]) ?? [];
    current.push(row);
    map.set(row[key], current);
  }
  return map;
}

function clientNameOf(persons: PersonDashboardRow[]): string {
  const billing = persons.find((person) => person.role === "billing")?.snapshot_name;
  const applicant = persons.find((person) => person.role === "applicant")?.snapshot_name;
  return billing || applicant || "依頼主未設定";
}

function orderAmountOf(financial: FinancialDashboardRow | undefined): number {
  return financial?.invoice_amount ?? financial?.estimate_amount ?? 0;
}

function salesAmountOf(financial: FinancialDashboardRow | undefined): number {
  return financial?.paid_amount ?? orderAmountOf(financial);
}

function caseTypeLabel(caseType: string): string {
  return (CaseTypeLabels as Record<string, string>)[caseType] ?? caseType;
}

function workCategoryOf(caseType: string): WorkCategorySalesRow["category"] {
  if (caseType === "building_permit") return "建物業務";
  if (caseType === "land_improvement" || caseType === "boundary_survey") return "土地業務";
  return "行政書士業務";
}

function lastTwelveMonths(): string[] {
  return Array.from({ length: 12 }, (_, index) => tokyoMonthKeyOffset(index - 11));
}
