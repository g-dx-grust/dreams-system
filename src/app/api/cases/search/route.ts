import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CALENDAR_SECRET_MIN_LENGTH = 32;
const PRIVATE_JSON_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "X-Content-Type-Options": "nosniff",
} as const;

type CaseSearchRow = {
  id: number;
  case_number: string;
  case_name: string;
  updated_at: string | null;
};

type CaseSearchItem = {
  id: number;
  caseNumber: string;
  caseName: string;
};

function secureEquals(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

function hasValidCalendarSecret(request: Request): boolean {
  const configured = process.env.KANRI_CALENDAR_API_SECRET?.trim();
  if (!configured || configured.length < CALENDAR_SECRET_MIN_LENGTH) return false;

  const headerSecret = request.headers.get("x-kanri-calendar-secret");
  const bearerSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  return [headerSecret, bearerSecret].some(
    (candidate) => candidate != null && secureEquals(candidate, configured),
  );
}

function toPattern(query: string): string {
  return `%${query.replace(/[%_]/g, "").slice(0, 50)}%`;
}

function toItem(row: CaseSearchRow): CaseSearchItem {
  return {
    id: row.id,
    caseNumber: row.case_number,
    caseName: row.case_name,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();

  if (query.length < 2) {
    return NextResponse.json(
      { items: [] satisfies CaseSearchItem[] },
      { headers: PRIVATE_JSON_HEADERS },
    );
  }

  const useAdminClient = hasValidCalendarSecret(request);

  try {
    if (!useAdminClient) {
      await requireUser();
    }

    const supabase = useAdminClient ? createAdminClient() : await createClient();
    const pattern = toPattern(query);

    const [numberResult, nameResult] = await Promise.all([
      supabase
        .from("cases")
        .select("id, case_number, case_name, updated_at")
        .ilike("case_number", pattern)
        .order("updated_at", { ascending: false })
        .limit(10),
      supabase
        .from("cases")
        .select("id, case_number, case_name, updated_at")
        .ilike("case_name", pattern)
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);

    if (numberResult.error || nameResult.error) {
      return NextResponse.json(
        { items: [] satisfies CaseSearchItem[], error: "案件検索に失敗しました。" },
        { status: 500, headers: PRIVATE_JSON_HEADERS },
      );
    }

    const byId = new Map<number, CaseSearchRow>();
    for (const row of (numberResult.data ?? []) as CaseSearchRow[]) {
      byId.set(row.id, row);
    }
    for (const row of (nameResult.data ?? []) as CaseSearchRow[]) {
      byId.set(row.id, row);
    }

    const items = Array.from(byId.values()).slice(0, 10).map(toItem);
    return NextResponse.json({ items }, { headers: PRIVATE_JSON_HEADERS });
  } catch (error) {
    if (error instanceof Error && error.message === "認証が必要です") {
      return NextResponse.json(
        { items: [] satisfies CaseSearchItem[], error: "認証が必要です。" },
        { status: 401, headers: PRIVATE_JSON_HEADERS },
      );
    }

    return NextResponse.json(
      { items: [] satisfies CaseSearchItem[], error: "案件検索に失敗しました。" },
      { status: 500, headers: PRIVATE_JSON_HEADERS },
    );
  }
}
