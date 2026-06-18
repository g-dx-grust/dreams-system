import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { cn } from "@/lib/cn";
import type { CalendarRangeData, CalendarSchedule } from "@/server/calendar";

const COLOR_CLASS_BY_TOKEN: Record<string, string> = {
  danger: "calendar-event--danger",
  main: "calendar-event--main",
  "text-grey": "calendar-event--text-grey",
  "chart-1": "calendar-event--chart-1",
  "chart-2": "calendar-event--chart-2",
  "chart-3": "calendar-event--chart-3",
  "chart-4": "calendar-event--chart-4",
  "chart-5": "calendar-event--chart-5",
  "chart-6": "calendar-event--chart-6",
  "chart-7": "calendar-event--chart-7",
  "chart-8": "calendar-event--chart-8",
  "chart-9": "calendar-event--chart-9",
  "chart-10": "calendar-event--chart-10",
  neutral: "calendar-event--neutral",
};

function getScheduleColorClass(color: string): string {
  return COLOR_CLASS_BY_TOKEN[color] ?? "calendar-event--neutral";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function scheduleLabel(schedule: CalendarSchedule): string {
  return `${formatTime(schedule.startAt)} ${schedule.title}`;
}

function CalendarScheduleItem({
  schedule,
  userName,
  compact,
}: {
  schedule: CalendarSchedule;
  userName: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "calendar-event rounded-s border px-xs py-xs text-xs leading-tight",
        getScheduleColorClass(schedule.scheduleTypeColor),
      )}
    >
      <p className="truncate font-semibold text-text-black">{scheduleLabel(schedule)}</p>
      {!compact && (
        <p className="calendar-event__type mt-xxs truncate">
          {userName}
          {schedule.caseNumber ? ` / ${schedule.caseNumber}` : ""}
        </p>
      )}
    </div>
  );
}

export function CalendarRangeView({ data }: { data: CalendarRangeData }) {
  const userNameById = new Map(data.users.map((user) => [user.id, user.fullName ?? user.email]));
  const total = data.schedules.length;

  if (data.view === "week") {
    return (
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-m">
          <div>
            <CardTitle>週表示</CardTitle>
            <p className="mt-xs text-s text-text-grey">全{total}件</p>
          </div>
          <div className="flex items-center gap-s text-s text-text-grey">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {data.titleLabel}
          </div>
        </CardHeader>
        <div className="overflow-auto">
          <div className="grid min-w-[calc(var(--spacing-xxl)*21)] grid-cols-7 border-t border-border">
            {data.days.map((day) => (
              <section
                key={day.date}
                className="min-h-[calc(var(--spacing-xxl)*5)] border-r border-border"
              >
                <div
                  className={cn(
                    "border-b border-border bg-head px-s py-s",
                    day.isToday && "bg-main-soft",
                  )}
                >
                  <Link
                    href={`/calendar?date=${day.date}&view=day`}
                    className="ui-link-subtle text-s font-semibold"
                  >
                    {day.dateLabel}
                  </Link>
                </div>
                <div className="space-y-xs p-s">
                  {day.schedules.length === 0 ? (
                    <p className="text-xs text-text-quaternary">予定なし</p>
                  ) : (
                    day.schedules.map((schedule) => (
                      <CalendarScheduleItem
                        key={schedule.id}
                        schedule={schedule}
                        userName={
                          schedule.userId
                            ? (userNameById.get(schedule.userId) ?? "未登録ユーザー")
                            : "未担当"
                        }
                      />
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-m">
        <div>
          <CardTitle>月表示</CardTitle>
          <p className="mt-xs text-s text-text-grey">全{total}件</p>
        </div>
        <div className="flex items-center gap-s text-s text-text-grey">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {data.titleLabel}
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {data.days.length === 0 ? (
          <Empty title="表示できる日付がありません" />
        ) : (
          <div className="overflow-auto">
            <div className="grid min-w-[calc(var(--spacing-xxl)*21)] grid-cols-7 border-t border-border">
              {["月", "火", "水", "木", "金", "土", "日"].map((label) => (
                <div
                  key={label}
                  className="border-b border-r border-border bg-head px-s py-xs text-xs font-semibold text-text-grey"
                >
                  {label}
                </div>
              ))}
              {data.days.map((day) => {
                const visibleSchedules = day.schedules.slice(0, 3);
                const hiddenCount = day.schedules.length - visibleSchedules.length;
                return (
                  <section
                    key={day.date}
                    className={cn(
                      "min-h-[calc(var(--spacing-xxl)*4)] border-b border-r border-border bg-white p-s",
                      !day.isCurrentMonth && "bg-grey-5 text-text-quaternary",
                      day.isToday && "bg-main-soft",
                    )}
                  >
                    <Link
                      href={`/calendar?date=${day.date}&view=day`}
                      className={cn(
                        "ui-link-subtle inline-flex h-6 items-center text-s font-semibold",
                        !day.isCurrentMonth && "text-text-grey",
                      )}
                      aria-label={`${day.dateLabel}の日表示へ移動`}
                    >
                      {day.dayNumber}
                    </Link>
                    <div className="mt-xs space-y-xs">
                      {visibleSchedules.map((schedule) => (
                        <CalendarScheduleItem
                          key={schedule.id}
                          schedule={schedule}
                          userName={
                            schedule.userId
                              ? (userNameById.get(schedule.userId) ?? "未登録ユーザー")
                              : "未担当"
                          }
                          compact
                        />
                      ))}
                      {hiddenCount > 0 && (
                        <Link
                          href={`/calendar?date=${day.date}&view=day`}
                          className="ui-link text-xs"
                        >
                          ほか{hiddenCount}件
                        </Link>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
