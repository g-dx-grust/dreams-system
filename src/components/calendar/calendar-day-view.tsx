"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Clock,
  FileText,
  MapPin,
  MessageSquare,
  MoveHorizontal,
  Pencil,
  Plus,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Empty } from "@/components/ui/empty";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { CalendarScheduleForm } from "@/components/calendar/calendar-schedule-form";
import { DailyReportDialog } from "@/components/calendar/daily-report-panel";
import { cn } from "@/lib/cn";
import {
  createScheduleComment,
  deleteSchedule,
  moveSchedule,
  type CalendarDayData,
  type CalendarSchedule,
} from "@/server/calendar";

const SLOT_MINUTES = 30;
const DAY_START_MINUTE = 8 * 60;
const DAY_END_MINUTE = 18 * 60;
const TIME_SLOTS = Array.from(
  { length: (DAY_END_MINUTE - DAY_START_MINUTE) / SLOT_MINUTES },
  (_, index) => DAY_START_MINUTE + index * SLOT_MINUTES,
);

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
const DEFAULT_COLOR_CLASS = "calendar-event--neutral";

type CalendarGridStyle = React.CSSProperties & {
  "--calendar-time-column": string;
  "--calendar-person-column": string;
  "--calendar-slot-height": string;
};

type EventLayout = {
  schedule: CalendarSchedule;
  slotStart: number;
  slotSpan: number;
  laneIndex: number;
  laneCount: number;
};

type EditorState = { mode: "create" } | { mode: "edit"; scheduleId: string } | null;

function formatTimeFromMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function formatTimeRange(startAt: string, endAt: string): string {
  return `${formatTime(startAt)}〜${formatTime(endAt)}`;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatCommentDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function tokyoDayStartMs(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, -9);
}

function minuteFromDayStart(date: string, value: string): number {
  return Math.round((new Date(value).getTime() - tokyoDayStartMs(date)) / 60000);
}

function toTokyoIso(date: string, minute: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, Math.floor(minute / 60) - 9, minute % 60),
  ).toISOString();
}

function layoutEvents(schedules: CalendarSchedule[], date: string): EventLayout[] {
  const normalized = schedules
    .map((schedule) => {
      const rawStart = minuteFromDayStart(date, schedule.startAt);
      const rawEnd = minuteFromDayStart(date, schedule.endAt);
      const visibleStart = Math.max(DAY_START_MINUTE, rawStart);
      const visibleEnd = Math.min(DAY_END_MINUTE, rawEnd);
      if (visibleEnd <= visibleStart) return null;
      return {
        schedule,
        start: visibleStart,
        end: visibleEnd,
      };
    })
    .filter((value): value is { schedule: CalendarSchedule; start: number; end: number } =>
      Boolean(value),
    )
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const groups: Array<typeof normalized> = [];
  let currentGroup: typeof normalized = [];
  let currentEnd = -Infinity;

  normalized.forEach((event) => {
    if (currentGroup.length > 0 && event.start >= currentEnd) {
      groups.push(currentGroup);
      currentGroup = [];
      currentEnd = -Infinity;
    }
    currentGroup.push(event);
    currentEnd = Math.max(currentEnd, event.end);
  });
  if (currentGroup.length > 0) groups.push(currentGroup);

  return groups.flatMap((group) => {
    const laneEnds: number[] = [];
    const layouts = group.map((event) => {
      const reusableLane = laneEnds.findIndex((end) => end <= event.start);
      const laneIndex = reusableLane >= 0 ? reusableLane : laneEnds.length;
      laneEnds[laneIndex] = event.end;
      return {
        schedule: event.schedule,
        slotStart: (event.start - DAY_START_MINUTE) / SLOT_MINUTES,
        slotSpan: Math.max(1, Math.ceil((event.end - event.start) / SLOT_MINUTES)),
        laneIndex,
        laneCount: 1,
      };
    });
    const laneCount = Math.max(1, laneEnds.length);
    return layouts.map((layout) => ({ ...layout, laneCount }));
  });
}

function getScheduleColorClass(color: string): string {
  return COLOR_CLASS_BY_TOKEN[color] ?? DEFAULT_COLOR_CLASS;
}

function statusLabel(status: string): string {
  switch (status) {
    case "planned":
      return "予定";
    case "in_progress":
      return "進行中";
    case "done":
      return "完了";
    case "carried_over":
      return "繰越";
    case "cancelled":
      return "取消";
    default:
      return status;
  }
}

function statusTone(status: string): "neutral" | "info" | "warning" | "success" | "danger" {
  switch (status) {
    case "done":
      return "success";
    case "in_progress":
      return "info";
    case "carried_over":
      return "warning";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function CalendarDayView({
  data,
  initialScheduleId,
}: {
  data: CalendarDayData;
  initialScheduleId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [visibleUserIds, setVisibleUserIds] = React.useState<Set<string>>(
    () => new Set(data.users.map((user) => user.id)),
  );
  const [selectedScheduleId, setSelectedScheduleId] = React.useState<string | null>(() =>
    initialScheduleId && data.schedules.some((schedule) => schedule.id === initialScheduleId)
      ? initialScheduleId
      : (data.schedules[0]?.id ?? null),
  );
  const [editorState, setEditorState] = React.useState<EditorState>(null);
  const [dragOverKey, setDragOverKey] = React.useState<string | null>(null);
  const [pendingScheduleId, setPendingScheduleId] = React.useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null);
  const [isDailyReportOpen, setDailyReportOpen] = React.useState(false);
  const [commentBody, setCommentBody] = React.useState("");
  const [commentError, setCommentError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [isDeletePending, startDeleteTransition] = React.useTransition();
  const [isCommentPending, startCommentTransition] = React.useTransition();

  React.useEffect(() => {
    setVisibleUserIds(new Set(data.users.map((user) => user.id)));
  }, [data.users]);

  React.useEffect(() => {
    if (initialScheduleId && data.schedules.some((schedule) => schedule.id === initialScheduleId)) {
      setSelectedScheduleId(initialScheduleId);
    }
  }, [data.schedules, initialScheduleId]);

  React.useEffect(() => {
    setSelectedScheduleId((current) =>
      current && data.schedules.some((schedule) => schedule.id === current)
        ? current
        : (data.schedules[0]?.id ?? null),
    );
  }, [data.schedules]);

  React.useEffect(() => {
    setCommentBody("");
    setCommentError(null);
  }, [selectedScheduleId]);

  const visibleUsers = data.users.filter((user) => visibleUserIds.has(user.id));
  const userNameById = React.useMemo(
    () => new Map(data.users.map((user) => [user.id, user.fullName ?? user.email])),
    [data.users],
  );
  const selectedSchedule =
    data.schedules.find((schedule) => schedule.id === selectedScheduleId) ?? null;
  const selectedComments = selectedSchedule
    ? data.comments.filter((comment) => comment.targetId === selectedSchedule.id)
    : [];
  const editorSchedule =
    editorState?.mode === "edit"
      ? (data.schedules.find((schedule) => schedule.id === editorState.scheduleId) ?? null)
      : null;
  const deleteTarget = data.schedules.find((schedule) => schedule.id === deleteTargetId) ?? null;

  const gridStyle: CalendarGridStyle = {
    "--calendar-time-column": "calc(var(--spacing-xxl) * 2)",
    "--calendar-person-column": "calc(var(--spacing-xxl) * 5)",
    "--calendar-slot-height": "calc(var(--spacing-xl) + var(--spacing-xs))",
    gridTemplateColumns: `var(--calendar-time-column) repeat(${Math.max(
      1,
      visibleUsers.length,
    )}, minmax(var(--calendar-person-column), 1fr))`,
  };

  const toggleUser = (userId: string, checked: boolean) => {
    setVisibleUserIds((current) => {
      const next = new Set(current);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  const showAllUsers = () => setVisibleUserIds(new Set(data.users.map((user) => user.id)));
  const hideAllUsers = () => setVisibleUserIds(new Set());

  const onScheduleSaved = (scheduleId: string) => {
    setEditorState(null);
    setSelectedScheduleId(scheduleId);
    router.refresh();
  };

  const onDeleteSchedule = () => {
    if (!deleteTargetId) return;

    startDeleteTransition(async () => {
      try {
        const result = await deleteSchedule(deleteTargetId);
        if (result.ok) {
          toast({ message: "予定を削除しました。", tone: "success" });
          setDeleteTargetId(null);
          setEditorState(null);
          setSelectedScheduleId(null);
          router.refresh();
        } else {
          toast({ message: result.error, tone: "danger" });
        }
      } catch {
        toast({
          message: "予定の削除に失敗しました。時間をおいて再度お試しください。",
          tone: "danger",
        });
      }
    });
  };

  const onSubmitComment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSchedule) return;

    setCommentError(null);
    startCommentTransition(async () => {
      try {
        const result = await createScheduleComment({
          scheduleId: selectedSchedule.id,
          body: commentBody,
        });
        if (result.ok) {
          toast({ message: "コメントを投稿しました。", tone: "success" });
          setCommentBody("");
          router.refresh();
        } else {
          setCommentError(result.error);
        }
      } catch {
        setCommentError("コメントの投稿に失敗しました。時間をおいて再度お試しください。");
      }
    });
  };

  const onDropSchedule = (event: React.DragEvent, userId: string, minute: number) => {
    event.preventDefault();
    setDragOverKey(null);
    const scheduleId = event.dataTransfer.getData("text/plain");
    const schedule = data.schedules.find((item) => item.id === scheduleId);
    if (!schedule) return;

    const duration = Math.max(
      SLOT_MINUTES,
      Math.round(
        (new Date(schedule.endAt).getTime() - new Date(schedule.startAt).getTime()) / 60000,
      ),
    );
    const startAt = toTokyoIso(data.date, minute);
    const endAt = toTokyoIso(data.date, minute + duration);
    setPendingScheduleId(schedule.id);

    startTransition(async () => {
      try {
        const result = await moveSchedule({
          scheduleId: schedule.id,
          userId,
          startAt,
          endAt,
        });
        if (result.ok) {
          toast({ message: "予定を移動しました。", tone: "success" });
          router.refresh();
        } else {
          toast({ message: result.error, tone: "danger" });
        }
      } catch {
        toast({
          message: "予定の移動に失敗しました。時間をおいて再度お試しください。",
          tone: "danger",
        });
      } finally {
        setPendingScheduleId(null);
      }
    });
  };

  return (
    <div className="space-y-m">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-m">
          <div>
            <CardTitle>日表示</CardTitle>
            <p className="mt-xs text-s text-text-grey">
              横軸は社員、縦軸は時間です。予定は種別ごとの色で表示します。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-s">
            <div className="flex items-center gap-s text-s text-text-grey">
              <MoveHorizontal className="h-4 w-4" aria-hidden="true" />
              予定をドラッグして時間・担当者を変更
            </div>
            <Button type="button" variant="secondary" onClick={() => setDailyReportOpen(true)}>
              <FileText className="h-4 w-4" aria-hidden="true" />
              日報を開く
            </Button>
            {!editorState && (
              <Button type="button" onClick={() => setEditorState({ mode: "create" })}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                予定を追加する
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-m">
          <div className="flex flex-wrap items-center justify-between gap-m">
            <fieldset className="min-w-0 flex-1">
              <legend className="mb-xs text-s font-medium text-text-grey">担当者フィルター</legend>
              <div className="flex flex-wrap gap-s">
                {data.users.map((user) => (
                  <label
                    key={user.id}
                    className="flex h-8 items-center gap-xs text-s text-text-black"
                  >
                    <Checkbox
                      checked={visibleUserIds.has(user.id)}
                      onChange={(event) => toggleUser(user.id, event.target.checked)}
                    />
                    <span>{user.fullName ?? user.email}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex shrink-0 items-center gap-xs">
              <Button type="button" variant="secondary" size="sm" onClick={showAllUsers}>
                すべて表示
              </Button>
              <Button type="button" variant="text" size="sm" onClick={hideAllUsers}>
                すべて解除
              </Button>
            </div>
          </div>

          {data.scheduleTypes.length > 0 && (
            <div className="flex flex-wrap items-center gap-xs border-t border-border pt-s">
              <span className="mr-xs text-xs font-medium text-text-grey">予定種別</span>
              {data.scheduleTypes.map((type) => (
                <span
                  key={type.id}
                  className={cn(
                    "calendar-event inline-flex h-6 items-center rounded-s border px-xs text-xs",
                    getScheduleColorClass(type.color),
                  )}
                >
                  {type.name}
                </span>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {editorState?.mode === "create" && (
        <CalendarScheduleForm
          mode="create"
          date={data.date}
          users={data.users}
          scheduleTypes={data.scheduleTypes}
          onCancel={() => setEditorState(null)}
          onSaved={onScheduleSaved}
        />
      )}

      {editorState?.mode === "edit" && editorSchedule && (
        <CalendarScheduleForm
          mode="edit"
          date={data.date}
          users={data.users}
          scheduleTypes={data.scheduleTypes}
          schedule={editorSchedule}
          onCancel={() => setEditorState(null)}
          onSaved={onScheduleSaved}
        />
      )}

      <Card>
        {visibleUsers.length === 0 ? (
          <Empty
            title="表示する社員が選択されていません"
            hint="担当者フィルターで1名以上を選択してください。"
            action={
              <Button type="button" variant="secondary" onClick={showAllUsers}>
                すべて表示
              </Button>
            }
          />
        ) : (
          <div className="overflow-auto">
            <div className="grid min-w-max" style={gridStyle}>
              <div className="sticky left-0 top-0 z-20 border-b border-r border-border bg-head px-s py-s text-s font-semibold text-text-grey">
                時間
              </div>
              {visibleUsers.map((user) => (
                <div
                  key={user.id}
                  className="sticky top-0 z-10 border-b border-r border-border bg-head px-s py-s text-s font-semibold text-text-black"
                >
                  <span className="block truncate">{user.fullName ?? user.email}</span>
                </div>
              ))}

              <div className="sticky left-0 z-10 border-r border-border bg-white">
                {TIME_SLOTS.map((minute) => (
                  <div
                    key={minute}
                    className="border-b border-border px-s py-xs text-xs text-text-grey tabular-nums"
                    style={{ height: "var(--calendar-slot-height)" }}
                  >
                    {formatTimeFromMinute(minute)}
                  </div>
                ))}
              </div>

              {visibleUsers.map((user) => {
                const schedules = data.schedules.filter((schedule) => schedule.userId === user.id);
                const layouts = layoutEvents(schedules, data.date);
                return (
                  <div
                    key={user.id}
                    className="relative border-r border-border"
                    style={{
                      minHeight: `calc(var(--calendar-slot-height) * ${TIME_SLOTS.length})`,
                    }}
                  >
                    {TIME_SLOTS.map((minute) => {
                      const key = `${user.id}:${minute}`;
                      return (
                        <div
                          key={minute}
                          className={cn(
                            "border-b border-border bg-white transition-colors",
                            dragOverKey === key && "bg-main-soft",
                          )}
                          style={{ height: "var(--calendar-slot-height)" }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDragOverKey(key);
                          }}
                          onDragLeave={() => setDragOverKey(null)}
                          onDrop={(event) => onDropSchedule(event, user.id, minute)}
                        />
                      );
                    })}

                    {layouts.map((layout) => {
                      const schedule = layout.schedule;
                      const widthPercent = 100 / layout.laneCount;
                      const leftPercent = widthPercent * layout.laneIndex;
                      return (
                        <button
                          key={schedule.id}
                          type="button"
                          draggable={!isPending}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", schedule.id);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => setSelectedScheduleId(schedule.id)}
                          className={cn(
                            "calendar-event absolute z-0 overflow-hidden rounded-s border py-xs pl-s pr-xs text-left text-xs leading-tight shadow-s transition-[box-shadow,transform]",
                            getScheduleColorClass(schedule.scheduleTypeColor),
                            selectedScheduleId === schedule.id && "ring-2 ring-main",
                            pendingScheduleId === schedule.id && "opacity-60",
                          )}
                          style={{
                            top: `calc(var(--calendar-slot-height) * ${layout.slotStart} + var(--spacing-xs))`,
                            height: `calc(var(--calendar-slot-height) * ${layout.slotSpan} - var(--spacing-s))`,
                            left: `calc(${leftPercent}% + var(--spacing-xs))`,
                            width: `calc(${widthPercent}% - var(--spacing-s))`,
                          }}
                          aria-label={`${formatTimeRange(schedule.startAt, schedule.endAt)} ${schedule.title}`}
                        >
                          <span className="block font-semibold text-text-black">
                            {formatTimeRange(schedule.startAt, schedule.endAt)}
                          </span>
                          <span className="mt-xxs block truncate font-semibold text-text-black">
                            {schedule.title}
                          </span>
                          <span className="calendar-event__type mt-xxs block truncate">
                            {schedule.scheduleTypeName ?? "予定"}
                            {schedule.caseNumber ? ` ${schedule.caseNumber}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-m">
          <CardTitle>予定詳細</CardTitle>
          {selectedSchedule && (
            <div className="flex items-center gap-xs">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditorState({ mode: "edit", scheduleId: selectedSchedule.id })}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                編集する
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setDeleteTargetId(selectedSchedule.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                削除する
              </Button>
            </div>
          )}
        </CardHeader>
        <CardBody>
          {selectedSchedule ? (
            <div className="grid gap-m">
              <div className="flex flex-wrap items-start justify-between gap-m">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-xs">
                    <Badge tone={statusTone(selectedSchedule.status)}>
                      {statusLabel(selectedSchedule.status)}
                    </Badge>
                    <span
                      className={cn(
                        "calendar-event inline-flex h-6 items-center rounded-s border px-xs text-xs",
                        getScheduleColorClass(selectedSchedule.scheduleTypeColor),
                      )}
                    >
                      {selectedSchedule.scheduleTypeName ?? "予定"}
                    </span>
                  </div>
                  <h2 className="mt-s text-l font-semibold text-text-black">
                    {selectedSchedule.title}
                  </h2>
                  {selectedSchedule.caseNumber && (
                    <p className="mt-xs text-s text-text-grey">
                      {selectedSchedule.caseId ? (
                        <Link href={`/cases/${selectedSchedule.caseId}`} className="ui-link">
                          {selectedSchedule.caseNumber}
                          {selectedSchedule.caseName ? ` / ${selectedSchedule.caseName}` : ""}
                        </Link>
                      ) : (
                        <>
                          {selectedSchedule.caseNumber}
                          {selectedSchedule.caseName ? ` / ${selectedSchedule.caseName}` : ""}
                        </>
                      )}
                    </p>
                  )}
                </div>
                {selectedSchedule.larkEventId && (
                  <Badge tone={selectedSchedule.syncSource === "lark" ? "info" : "neutral"}>
                    Lark同期済み
                  </Badge>
                )}
              </div>

              <dl className="grid gap-s text-s">
                <div className="flex items-start gap-s">
                  <Clock className="mt-xxs h-4 w-4 shrink-0 text-text-grey" aria-hidden="true" />
                  <div>
                    <dt className="font-medium text-text-grey">日時</dt>
                    <dd className="text-text-black">
                      {formatDateTime(selectedSchedule.startAt)}〜
                      {formatTime(selectedSchedule.endAt)}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-s">
                  <UsersRound
                    className="mt-xxs h-4 w-4 shrink-0 text-text-grey"
                    aria-hidden="true"
                  />
                  <div>
                    <dt className="font-medium text-text-grey">担当者・同行者</dt>
                    <dd className="text-text-black">
                      {selectedSchedule.userId
                        ? (userNameById.get(selectedSchedule.userId) ?? "未登録ユーザー")
                        : "未担当"}
                      {selectedSchedule.coUserIds.length > 0 && (
                        <span className="text-text-grey">
                          {" / 同行者: "}
                          {selectedSchedule.coUserIds
                            .map((userId) => userNameById.get(userId) ?? "未登録ユーザー")
                            .join("、")}
                        </span>
                      )}
                    </dd>
                  </div>
                </div>
                {selectedSchedule.location && (
                  <div className="flex items-start gap-s">
                    <MapPin className="mt-xxs h-4 w-4 shrink-0 text-text-grey" aria-hidden="true" />
                    <div>
                      <dt className="font-medium text-text-grey">場所</dt>
                      <dd className="text-text-black">{selectedSchedule.location}</dd>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-s">
                  <CalendarDays
                    className="mt-xxs h-4 w-4 shrink-0 text-text-grey"
                    aria-hidden="true"
                  />
                  <div>
                    <dt className="font-medium text-text-grey">実績</dt>
                    <dd className="text-text-black">
                      {selectedSchedule.actualMinutes != null
                        ? `${selectedSchedule.actualMinutes}分`
                        : "未入力"}
                    </dd>
                  </div>
                </div>
              </dl>

              {selectedSchedule.memo && (
                <div className="rounded-m border border-border bg-grey-5 p-m text-s text-text-black whitespace-pre-wrap">
                  {selectedSchedule.memo}
                </div>
              )}

              <section className="border-t border-border pt-m">
                <div className="mb-s flex items-center gap-s">
                  <MessageSquare className="h-4 w-4 text-text-grey" aria-hidden="true" />
                  <h3 className="text-s font-semibold text-text-black">コメント</h3>
                  <span className="text-xs text-text-grey">{selectedComments.length}件</span>
                </div>

                {selectedComments.length > 0 ? (
                  <div className="divide-y divide-border border-y border-border">
                    {selectedComments.map((comment) => (
                      <article key={comment.id} className="py-s">
                        <div className="flex flex-wrap items-center gap-s text-xs text-text-grey">
                          <span className="font-medium text-text-black">
                            {comment.authorName ?? "未登録ユーザー"}
                          </span>
                          <time dateTime={comment.createdAt}>
                            {formatCommentDate(comment.createdAt)}
                          </time>
                        </div>
                        <p className="mt-xs whitespace-pre-wrap text-s text-text-black">
                          {comment.body}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="text-s text-text-grey">コメントはまだありません。</p>
                )}

                <form onSubmit={onSubmitComment} className="mt-m flex flex-col gap-s">
                  <Field label="コメント" error={commentError ?? undefined}>
                    <Textarea
                      rows={3}
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.target.value)}
                      aria-invalid={!!commentError}
                    />
                  </Field>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      variant="secondary"
                      loading={isCommentPending}
                      loadingLabel="投稿中…"
                      disabled={isCommentPending || commentBody.trim().length === 0}
                    >
                      投稿する
                    </Button>
                  </div>
                </form>
              </section>
            </div>
          ) : (
            <Empty title="予定が選択されていません" hint="カレンダー上の予定を選択してください。" />
          )}
        </CardBody>
      </Card>

      <DailyReportDialog
        open={isDailyReportOpen}
        onClose={() => setDailyReportOpen(false)}
        date={data.date}
        dateLabel={data.dateLabel}
        report={data.dailyReport}
      />

      <ConfirmDialog
        open={!!deleteTargetId}
        title="予定を削除します"
        description={
          deleteTarget ? (
            <span>
              予定「{deleteTarget.title}」を削除します。削除後はカレンダー上に表示されません。
            </span>
          ) : undefined
        }
        confirmLabel="削除する"
        loading={isDeletePending}
        onCancel={() => {
          if (!isDeletePending) setDeleteTargetId(null);
        }}
        onConfirm={onDeleteSchedule}
      />
    </div>
  );
}
