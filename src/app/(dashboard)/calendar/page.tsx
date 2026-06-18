import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CalendarDayView } from "@/components/calendar/calendar-day-view";
import { CalendarRangeView } from "@/components/calendar/calendar-range-view";
import { cn } from "@/lib/cn";
import { getCalendarData, type CalendarViewMode } from "@/server/calendar";

type Search = {
  date?: string;
  view?: string;
  schedule?: string;
};

const VIEW_OPTIONS = [
  { value: "day", label: "日" },
  { value: "week", label: "週" },
  { value: "month", label: "月" },
] as const satisfies ReadonlyArray<{ value: CalendarViewMode; label: string }>;

const MOVE_LABELS: Record<CalendarViewMode, { previous: string; next: string }> = {
  day: { previous: "前日", next: "翌日" },
  week: { previous: "前週", next: "翌週" },
  month: { previous: "前月", next: "翌月" },
};

function todayInTokyo(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function calendarHref(date: string, view: CalendarViewMode): string {
  const params = new URLSearchParams({ date, view });
  return `/calendar?${params.toString()}`;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const result = await getCalendarData(sp.date, sp.view);

  if (!result.ok) {
    return (
      <Card className="p-m">
        <p className="text-danger">{result.error}</p>
      </Card>
    );
  }

  const data = result.data;
  const today = todayInTokyo();
  const moveLabels = MOVE_LABELS[data.view];

  return (
    <>
      <PageHeader
        title="カレンダー"
        description={`${
          data.view === "day" ? data.dateLabel : data.titleLabel
        }の予定を確認します。`}
        actions={
          <div className="flex flex-wrap items-center gap-s">
            <nav
              className="flex items-center rounded-s border border-border bg-white p-xxs"
              aria-label="表示切替"
            >
              {VIEW_OPTIONS.map((option) => {
                const isActive = data.view === option.value;
                return (
                  <Link
                    key={option.value}
                    href={calendarHref(data.date, option.value)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex h-7 min-w-[calc(var(--spacing-xl)+var(--spacing-s))] items-center justify-center rounded-s px-s text-s font-medium",
                      isActive
                        ? "bg-main-soft text-main"
                        : "text-text-grey hover:bg-grey-7 hover:text-text-black",
                    )}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </nav>
            <Link
              href={calendarHref(data.previousDate, data.view)}
              aria-label={`${moveLabels.previous}に移動`}
            >
              <Button type="button" variant="secondary" size="sm">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                {moveLabels.previous}
              </Button>
            </Link>
            <Link href={calendarHref(today, data.view)}>
              <Button type="button" variant="secondary" size="sm">
                今日
              </Button>
            </Link>
            <Link
              href={calendarHref(data.nextDate, data.view)}
              aria-label={`${moveLabels.next}に移動`}
            >
              <Button type="button" variant="secondary" size="sm">
                {moveLabels.next}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        }
      />

      {data.view === "day" ? (
        <CalendarDayView data={data} initialScheduleId={sp.schedule} />
      ) : (
        <CalendarRangeView data={data} />
      )}
    </>
  );
}
