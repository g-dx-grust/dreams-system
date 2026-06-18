"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, type AppUser } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { fail, ok, type ActionResult } from "@/lib/result";
import { notifyDailyReportSubmitted } from "@/server/lark-sync";
import {
  DailyReportCommentSchema,
  DailyReportSaveSchema,
  DailyReportSubmitSchema,
  ScheduleCommentSchema,
  ScheduleFormSchema,
  ScheduleIdSchema,
  ScheduleMoveSchema,
  type DailyReportCommentInput,
  type DailyReportSaveInput,
  type DailyReportSubmitInput,
  type ScheduleCommentInput,
  type ScheduleFormInput,
  type ScheduleMoveInput,
} from "@/lib/validators/calendar";

const BUSINESS_TIME_ZONE = "Asia/Tokyo";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CalendarViewMode = "day" | "week" | "month";

export type CalendarUser = {
  id: string;
  fullName: string | null;
  email: string;
};

export type CalendarScheduleType = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
};

export type CalendarSchedule = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  userId: string | null;
  coUserIds: string[];
  caseId: number | null;
  caseNumber: string | null;
  caseName: string | null;
  scheduleTypeId: string | null;
  scheduleTypeName: string | null;
  scheduleTypeColor: string;
  location: string | null;
  memo: string | null;
  status: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  actualMinutes: number | null;
  larkEventId: string | null;
  syncSource: string;
  lastSyncedAt: string | null;
};

export type CalendarComment = {
  id: string;
  targetId: string;
  userId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type CalendarDailyReportStatus = "draft" | "submitted";

export type CalendarDailyReport = {
  id: string;
  userId: string;
  reportDate: string;
  body: string;
  status: CalendarDailyReportStatus;
  submittedAt: string | null;
  updatedAt: string;
  comments: CalendarComment[];
};

export type CalendarCaseOption = {
  id: number;
  caseNumber: string;
  caseName: string;
};

export type CalendarDayData = {
  view: "day";
  date: string;
  dateLabel: string;
  previousDate: string;
  nextDate: string;
  users: CalendarUser[];
  scheduleTypes: CalendarScheduleType[];
  schedules: CalendarSchedule[];
  comments: CalendarComment[];
  dailyReport: CalendarDailyReport | null;
};

export type CalendarRangeDay = {
  date: string;
  dateLabel: string;
  weekdayLabel: string;
  dayNumber: string;
  isToday: boolean;
  isCurrentMonth: boolean;
  schedules: CalendarSchedule[];
};

export type CalendarRangeData = {
  view: "week" | "month";
  date: string;
  titleLabel: string;
  previousDate: string;
  nextDate: string;
  startDate: string;
  endDate: string;
  users: CalendarUser[];
  scheduleTypes: CalendarScheduleType[];
  schedules: CalendarSchedule[];
  days: CalendarRangeDay[];
};

export type CalendarPageData = CalendarDayData | CalendarRangeData;

type ScheduleTypeRow = {
  id: string;
  name: string;
  color: string;
  sort_order: number | null;
};

type CalendarUserRow = {
  id: string;
  full_name: string | null;
  email: string;
};

type ScheduleRelation<T> = T | T[] | null;

type ScheduleQueryRow = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  user_id: string | null;
  co_user_ids: string[] | null;
  case_id: number | null;
  case_number: string | null;
  schedule_type_id: string | null;
  location: string | null;
  memo: string | null;
  status: string;
  actual_start_at: string | null;
  actual_end_at: string | null;
  actual_minutes: number | null;
  lark_event_id: string | null;
  sync_source: string;
  last_synced_at: string | null;
  schedule_types: ScheduleRelation<ScheduleTypeRow>;
  cases: ScheduleRelation<{ id: number; case_name: string; case_number: string }>;
};

type MoveTargetRow = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  user_id: string | null;
  created_by: string | null;
};

type ScheduleMutationTargetRow = MoveTargetRow & {
  co_user_ids: string[] | null;
  case_id: number | null;
  case_number: string | null;
  schedule_type_id: string | null;
  location: string | null;
  memo: string | null;
  status: string;
};

type CommentRow = {
  id: string;
  target_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

type DailyReportRow = {
  id: string;
  user_id: string;
  report_date: string;
  body: string | null;
  content: string | null;
  status: string;
  submitted_at: string | null;
  updated_at: string;
};

type CaseOptionRow = {
  id: number;
  case_number: string;
  case_name: string;
};

function firstRelation<T>(value: ScheduleRelation<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function todayInTokyo(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeDate(input?: string): string {
  if (!input || !DATE_RE.test(input)) return todayInTokyo();
  const [year, month, day] = input.split("-").map(Number);
  if (!year || !month || !day) return todayInTokyo();
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    return todayInTokyo();
  }
  return input;
}

function normalizeCalendarView(input?: string): CalendarViewMode {
  if (input === "week" || input === "month") return input;
  return "day";
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  const yyyy = value.getUTCFullYear();
  const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(value.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function monthStart(date: string): string {
  const [year, month] = date.split("-").map(Number);
  return `${String(year ?? 1970).padStart(4, "0")}-${String(month ?? 1).padStart(2, "0")}-01`;
}

function shiftMonth(date: string, months: number): string {
  const [year, month] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 + months, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function weekStart(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  const dayIndex = (value.getUTCDay() + 6) % 7;
  return shiftDate(date, -dayIndex);
}

function eachDate(startDate: string, endDateExclusive: string): string[] {
  const dates: string[] = [];
  let current = startDate;
  while (current < endDateExclusive) {
    dates.push(current);
    current = shiftDate(current, 1);
  }
  return dates;
}

function tokyoDateStartIso(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, -9)).toISOString();
}

function tokyoDateBounds(date: string): { start: string; end: string } {
  return { start: tokyoDateStartIso(date), end: tokyoDateStartIso(shiftDate(date, 1)) };
}

function tokyoRangeBounds(
  startDate: string,
  endDateExclusive: string,
): { start: string; end: string } {
  return { start: tokyoDateStartIso(startDate), end: tokyoDateStartIso(endDateExclusive) };
}

function toTokyoIso(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, (hour ?? 0) - 9, minute ?? 0),
  ).toISOString();
}

function formatDateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)));
}

function formatShortDateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: BUSINESS_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)));
}

function formatWeekTitle(startDate: string, endDate: string): string {
  const start = formatShortDateLabel(startDate);
  const end = formatShortDateLabel(shiftDate(endDate, -1));
  return `${start}〜${end}`;
}

function formatMonthTitle(date: string): string {
  const [year, month] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)));
}

function formatWeekdayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
  }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)));
}

function dayNumber(date: string): string {
  const [, , day] = date.split("-");
  return String(Number(day ?? "1"));
}

function canManageSchedule(user: AppUser, schedule: Pick<MoveTargetRow, "user_id" | "created_by">) {
  return user.role === "admin" || schedule.user_id === user.id || schedule.created_by === user.id;
}

async function listCalendarUsers(): Promise<ActionResult<CalendarUser[]>> {
  const queryUsers = async () => {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return createAdminClient()
        .from("users")
        .select("id, full_name, email")
        .eq("is_active", true)
        .order("full_name", { ascending: true });
    }

    const supabase = await createClient();
    return supabase
      .from("users")
      .select("id, full_name, email")
      .eq("is_active", true)
      .order("full_name", { ascending: true });
  };

  const { data, error } = await queryUsers();
  if (error) return fail("社員一覧の取得に失敗しました。時間をおいて再度お試しください。");

  return ok(
    ((data ?? []) as CalendarUserRow[]).map((user) => ({
      id: user.id,
      fullName: user.full_name,
      email: user.email,
    })),
  );
}

async function listScheduleTypes(): Promise<ActionResult<CalendarScheduleType[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_types")
    .select("id, name, color, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) return fail("予定種別の取得に失敗しました。時間をおいて再度お試しください。");

  return ok(
    ((data ?? []) as ScheduleTypeRow[]).map((type) => ({
      id: type.id,
      name: type.name,
      color: type.color,
      sortOrder: type.sort_order ?? 0,
    })),
  );
}

async function listSchedulesForRange(
  startDate: string,
  endDateExclusive: string,
): Promise<ActionResult<CalendarSchedule[]>> {
  const { start, end } = tokyoRangeBounds(startDate, endDateExclusive);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedules")
    .select(
      `
      id,
      title,
      start_at,
      end_at,
      user_id,
      co_user_ids,
      case_id,
      case_number,
      schedule_type_id,
      location,
      memo,
      status,
      actual_start_at,
      actual_end_at,
      actual_minutes,
      lark_event_id,
      sync_source,
      last_synced_at,
      schedule_types (id, name, color, sort_order),
      cases (id, case_name, case_number)
    `,
    )
    .is("deleted_at", null)
    .lt("start_at", end)
    .gt("end_at", start)
    .order("start_at", { ascending: true });

  if (error) return fail("予定の取得に失敗しました。時間をおいて再度お試しください。");

  return ok(
    ((data ?? []) as ScheduleQueryRow[]).map((schedule) => {
      const scheduleType = firstRelation(schedule.schedule_types);
      const caseRow = firstRelation(schedule.cases);
      return {
        id: schedule.id,
        title: schedule.title,
        startAt: schedule.start_at,
        endAt: schedule.end_at,
        userId: schedule.user_id,
        coUserIds: schedule.co_user_ids ?? [],
        caseId: schedule.case_id,
        caseNumber: schedule.case_number ?? caseRow?.case_number ?? null,
        caseName: caseRow?.case_name ?? null,
        scheduleTypeId: schedule.schedule_type_id,
        scheduleTypeName: scheduleType?.name ?? null,
        scheduleTypeColor: scheduleType?.color ?? "neutral",
        location: schedule.location,
        memo: schedule.memo,
        status: schedule.status,
        actualStartAt: schedule.actual_start_at,
        actualEndAt: schedule.actual_end_at,
        actualMinutes: schedule.actual_minutes,
        larkEventId: schedule.lark_event_id,
        syncSource: schedule.sync_source,
        lastSyncedAt: schedule.last_synced_at,
      };
    }),
  );
}

async function listDaySchedules(date: string): Promise<ActionResult<CalendarSchedule[]>> {
  return listSchedulesForRange(date, shiftDate(date, 1));
}

async function listScheduleComments(
  scheduleIds: string[],
  users: CalendarUser[],
): Promise<ActionResult<CalendarComment[]>> {
  if (scheduleIds.length === 0) return ok([]);

  const userNameById = new Map(users.map((user) => [user.id, user.fullName ?? user.email]));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .select("id, target_id, user_id, body, created_at, updated_at")
    .eq("target_type", "schedule")
    .in("target_id", scheduleIds)
    .order("created_at", { ascending: true });

  if (error) return fail("コメントの取得に失敗しました。時間をおいて再度お試しください。");

  return ok(
    ((data ?? []) as CommentRow[]).map((comment) => ({
      id: comment.id,
      targetId: comment.target_id,
      userId: comment.user_id,
      authorName: userNameById.get(comment.user_id) ?? null,
      body: comment.body,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
    })),
  );
}

async function listDailyReportComments(
  reportId: string,
  users: CalendarUser[],
): Promise<ActionResult<CalendarComment[]>> {
  const userNameById = new Map(users.map((user) => [user.id, user.fullName ?? user.email]));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .select("id, target_id, user_id, body, created_at, updated_at")
    .eq("target_type", "daily_report")
    .eq("target_id", reportId)
    .order("created_at", { ascending: true });

  if (error) return fail("日報コメントの取得に失敗しました。時間をおいて再度お試しください。");

  return ok(
    ((data ?? []) as CommentRow[]).map((comment) => ({
      id: comment.id,
      targetId: comment.target_id,
      userId: comment.user_id,
      authorName: userNameById.get(comment.user_id) ?? null,
      body: comment.body,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
    })),
  );
}

function normalizeDailyReportStatus(status: string): CalendarDailyReportStatus {
  return status === "submitted" ? "submitted" : "draft";
}

async function getDailyReportForDate(
  date: string,
  user: AppUser,
  users: CalendarUser[],
): Promise<ActionResult<CalendarDailyReport | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_reports")
    .select("id, user_id, report_date, body, content, status, submitted_at, updated_at")
    .eq("user_id", user.id)
    .eq("report_date", date)
    .maybeSingle();

  if (error) return fail("日報の取得に失敗しました。時間をおいて再度お試しください。");
  if (!data) return ok(null);

  const report = data as DailyReportRow;
  const commentsRes = await listDailyReportComments(report.id, users);
  if (!commentsRes.ok) return commentsRes;

  const status = normalizeDailyReportStatus(report.status);
  return ok({
    id: report.id,
    userId: report.user_id,
    reportDate: report.report_date,
    body: report.body ?? report.content ?? "",
    status,
    submittedAt: status === "submitted" ? report.submitted_at : null,
    updatedAt: report.updated_at,
    comments: commentsRes.data,
  });
}

export async function searchCalendarCases(
  query: string,
): Promise<ActionResult<CalendarCaseOption[]>> {
  await requireUser();
  const keyword = query.trim().slice(0, 50);
  if (keyword.length < 2) return ok([]);

  const pattern = `%${keyword}%`;
  const supabase = await createClient();
  const [numberRes, nameRes] = await Promise.all([
    supabase
      .from("cases")
      .select("id, case_number, case_name")
      .ilike("case_number", pattern)
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("cases")
      .select("id, case_number, case_name")
      .ilike("case_name", pattern)
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);

  if (numberRes.error || nameRes.error) {
    return fail("案件候補の取得に失敗しました。時間をおいて再度お試しください。");
  }

  const merged = new Map<number, CalendarCaseOption>();
  [...((numberRes.data ?? []) as CaseOptionRow[]), ...((nameRes.data ?? []) as CaseOptionRow[])]
    .slice(0, 20)
    .forEach((row) => {
      if (!merged.has(row.id)) {
        merged.set(row.id, {
          id: row.id,
          caseNumber: row.case_number,
          caseName: row.case_name,
        });
      }
    });

  return ok([...merged.values()].slice(0, 10));
}

export async function getCalendarDayData(
  dateInput?: string,
): Promise<ActionResult<CalendarDayData>> {
  const currentUser = await requireUser();
  const date = normalizeDate(dateInput);
  const [usersRes, typesRes, schedulesRes] = await Promise.all([
    listCalendarUsers(),
    listScheduleTypes(),
    listDaySchedules(date),
  ]);

  if (!usersRes.ok) return usersRes;
  if (!typesRes.ok) return typesRes;
  if (!schedulesRes.ok) return schedulesRes;

  const [commentsRes, dailyReportRes] = await Promise.all([
    listScheduleComments(
      schedulesRes.data.map((schedule) => schedule.id),
      usersRes.data,
    ),
    getDailyReportForDate(date, currentUser, usersRes.data),
  ]);
  if (!commentsRes.ok) return commentsRes;
  if (!dailyReportRes.ok) return dailyReportRes;

  return ok({
    view: "day",
    date,
    dateLabel: formatDateLabel(date),
    previousDate: shiftDate(date, -1),
    nextDate: shiftDate(date, 1),
    users: usersRes.data,
    scheduleTypes: typesRes.data,
    schedules: schedulesRes.data,
    comments: commentsRes.data,
    dailyReport: dailyReportRes.data,
  });
}

function buildRangeDays(
  dates: string[],
  schedules: CalendarSchedule[],
  targetMonth: string | null,
): CalendarRangeDay[] {
  const today = todayInTokyo();
  return dates.map((date) => {
    const { start, end } = tokyoDateBounds(date);
    return {
      date,
      dateLabel: formatDateLabel(date),
      weekdayLabel: formatWeekdayLabel(date),
      dayNumber: dayNumber(date),
      isToday: date === today,
      isCurrentMonth: targetMonth ? date.startsWith(targetMonth) : true,
      schedules: schedules.filter((schedule) => schedule.startAt < end && schedule.endAt > start),
    };
  });
}

async function getCalendarRangeData(
  view: "week" | "month",
  dateInput?: string,
): Promise<ActionResult<CalendarRangeData>> {
  await requireUser();
  const date = normalizeDate(dateInput);
  const monthStartDate = monthStart(date);
  const startDate = view === "week" ? weekStart(date) : weekStart(monthStartDate);
  const endDateExclusive =
    view === "week"
      ? shiftDate(startDate, 7)
      : shiftDate(weekStart(shiftDate(shiftMonth(monthStartDate, 1), -1)), 7);
  const dates = eachDate(startDate, endDateExclusive);

  const [usersRes, typesRes, schedulesRes] = await Promise.all([
    listCalendarUsers(),
    listScheduleTypes(),
    listSchedulesForRange(startDate, endDateExclusive),
  ]);

  if (!usersRes.ok) return usersRes;
  if (!typesRes.ok) return typesRes;
  if (!schedulesRes.ok) return schedulesRes;

  return ok({
    view,
    date,
    titleLabel:
      view === "week" ? formatWeekTitle(startDate, endDateExclusive) : formatMonthTitle(date),
    previousDate: view === "week" ? shiftDate(date, -7) : shiftMonth(date, -1),
    nextDate: view === "week" ? shiftDate(date, 7) : shiftMonth(date, 1),
    startDate,
    endDate: shiftDate(endDateExclusive, -1),
    users: usersRes.data,
    scheduleTypes: typesRes.data,
    schedules: schedulesRes.data,
    days: buildRangeDays(
      dates,
      schedulesRes.data,
      view === "month" ? monthStartDate.slice(0, 7) : null,
    ),
  });
}

export async function getCalendarData(
  dateInput?: string,
  viewInput?: string,
): Promise<ActionResult<CalendarPageData>> {
  const view = normalizeCalendarView(viewInput);
  if (view === "day") return getCalendarDayData(dateInput);
  return getCalendarRangeData(view, dateInput);
}

async function resolveScheduleCase(
  caseId: number | null,
): Promise<ActionResult<{ caseId: number | null; caseNumber: string | null }>> {
  if (caseId == null) return ok({ caseId: null, caseNumber: null });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cases")
    .select("id, case_number")
    .eq("id", caseId)
    .maybeSingle();

  if (error || !data) {
    return fail("案件が見つかりません。案件番号を候補から選択し直してください。");
  }

  const row = data as { id: number; case_number: string };
  return ok({ caseId: row.id, caseNumber: row.case_number });
}

function scheduleFields(
  input: ScheduleFormInput,
  caseSelection: { caseId: number | null; caseNumber: string | null },
) {
  return {
    title: input.title,
    start_at: toTokyoIso(input.date, input.startTime),
    end_at: toTokyoIso(input.date, input.endTime),
    user_id: input.userId,
    case_id: caseSelection.caseId,
    case_number: caseSelection.caseNumber,
    schedule_type_id: input.scheduleTypeId,
    location: input.location,
    memo: input.memo,
    status: input.status,
    sync_source: "app",
    sync_status: "pending",
    sync_error: null,
    last_synced_at: null,
  };
}

export async function createSchedule(
  input: ScheduleFormInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = ScheduleFormSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(first?.message ?? "予定の入力内容を確認してください。", first?.path.join("."));
  }

  const user = await requireUser();
  const caseSelection = await resolveScheduleCase(parsed.data.caseId);
  if (!caseSelection.ok) return caseSelection;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedules")
    .insert({
      ...scheduleFields(parsed.data, caseSelection.data),
      co_user_ids: [],
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return fail("予定の登録に失敗しました。権限と入力内容を確認してください。");
  }

  const created = data as { id: string };
  await logAudit({
    userId: user.id,
    action: "schedule.create",
    entityType: "schedule",
    entityIdUuid: created.id,
    detail: { after: { ...parsed.data, case_number: caseSelection.data.caseNumber } },
  });

  revalidatePath("/calendar");
  return ok({ id: created.id });
}

export async function updateSchedule(
  scheduleId: string,
  input: ScheduleFormInput,
): Promise<ActionResult<{ id: string }>> {
  const parsedId = ScheduleIdSchema.safeParse(scheduleId);
  if (!parsedId.success)
    return fail(parsedId.error.issues[0]?.message ?? "予定の選択内容が正しくありません。");

  const parsed = ScheduleFormSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(first?.message ?? "予定の入力内容を確認してください。", first?.path.join("."));
  }

  const user = await requireUser();
  const supabase = await createClient();
  const { data: existing, error: selectError } = await supabase
    .from("schedules")
    .select(
      "id, title, start_at, end_at, user_id, created_by, co_user_ids, case_id, case_number, schedule_type_id, location, memo, status",
    )
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (selectError) return fail("予定の確認に失敗しました。時間をおいて再度お試しください。");
  if (!existing) return fail("予定が見つかりません。再読み込みして確認してください。");

  const schedule = existing as ScheduleMutationTargetRow;
  if (!canManageSchedule(user, schedule)) {
    return fail("他の社員の予定は編集できません。管理者に依頼してください。");
  }

  const caseSelection = await resolveScheduleCase(parsed.data.caseId);
  if (!caseSelection.ok) return caseSelection;

  const { error } = await supabase
    .from("schedules")
    .update({
      ...scheduleFields(parsed.data, caseSelection.data),
      updated_by: user.id,
    })
    .eq("id", parsedId.data);

  if (error) return fail("予定の更新に失敗しました。権限と入力内容を確認してください。");

  await logAudit({
    userId: user.id,
    action: "schedule.update",
    entityType: "schedule",
    entityIdUuid: parsedId.data,
    detail: {
      action: "updateSchedule",
      before: schedule,
      after: { ...parsed.data, case_number: caseSelection.data.caseNumber },
    },
  });

  revalidatePath("/calendar");
  return ok({ id: parsedId.data });
}

export async function deleteSchedule(scheduleId: string): Promise<ActionResult<{ id: string }>> {
  const parsedId = ScheduleIdSchema.safeParse(scheduleId);
  if (!parsedId.success)
    return fail(parsedId.error.issues[0]?.message ?? "予定の選択内容が正しくありません。");

  const user = await requireUser();
  const supabase = await createClient();
  const { data: existing, error: selectError } = await supabase
    .from("schedules")
    .select(
      "id, title, start_at, end_at, user_id, created_by, co_user_ids, case_id, case_number, schedule_type_id, location, memo, status",
    )
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (selectError) return fail("予定の確認に失敗しました。時間をおいて再度お試しください。");
  if (!existing) return fail("予定が見つかりません。再読み込みして確認してください。");

  const schedule = existing as ScheduleMutationTargetRow;
  if (!canManageSchedule(user, schedule)) {
    return fail("他の社員の予定は削除できません。管理者に依頼してください。");
  }

  const { error } = await supabase
    .from("schedules")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      updated_by: user.id,
      sync_source: "app",
      sync_status: "pending",
      sync_error: null,
      last_synced_at: null,
    })
    .eq("id", parsedId.data);

  if (error) return fail("予定の削除に失敗しました。権限を確認してください。");

  await logAudit({
    userId: user.id,
    action: "schedule.delete",
    entityType: "schedule",
    entityIdUuid: parsedId.data,
    detail: { before: schedule },
  });

  revalidatePath("/calendar");
  return ok({ id: parsedId.data });
}

export async function createScheduleComment(
  input: ScheduleCommentInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = ScheduleCommentSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(first?.message ?? "コメントの入力内容を確認してください。", first?.path.join("."));
  }

  const user = await requireUser();
  const supabase = await createClient();
  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("id")
    .eq("id", parsed.data.scheduleId)
    .is("deleted_at", null)
    .maybeSingle();

  if (scheduleError) return fail("予定の確認に失敗しました。時間をおいて再度お試しください。");
  if (!schedule) return fail("予定が見つかりません。再読み込みして確認してください。");

  const { data, error } = await supabase
    .from("comments")
    .insert({
      target_type: "schedule",
      target_id: parsed.data.scheduleId,
      user_id: user.id,
      body: parsed.data.body,
    })
    .select("id")
    .single();

  if (error || !data) return fail("コメントの投稿に失敗しました。時間をおいて再度お試しください。");

  const comment = data as { id: string };
  await logAudit({
    userId: user.id,
    action: "comment.create",
    entityType: "comment",
    entityIdUuid: comment.id,
    detail: { target_type: "schedule", target_id: parsed.data.scheduleId },
  });

  revalidatePath("/calendar");
  return ok({ id: comment.id });
}

async function getDailyReportMutationTarget(
  reportDate: string,
  user: AppUser,
): Promise<ActionResult<DailyReportRow | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_reports")
    .select("id, user_id, report_date, body, content, status, submitted_at, updated_at")
    .eq("user_id", user.id)
    .eq("report_date", reportDate)
    .maybeSingle();

  if (error) return fail("日報の確認に失敗しました。時間をおいて再度お試しください。");
  return ok(data ? (data as DailyReportRow) : null);
}

export async function saveDailyReport(
  input: DailyReportSaveInput,
): Promise<ActionResult<{ id: string; status: CalendarDailyReportStatus }>> {
  const parsed = DailyReportSaveSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(first?.message ?? "日報の入力内容を確認してください。", first?.path.join("."));
  }

  const user = await requireUser();
  const existingRes = await getDailyReportMutationTarget(parsed.data.reportDate, user);
  if (!existingRes.ok) return fail(existingRes.error, existingRes.field);

  const supabase = await createClient();
  const existing = existingRes.data;
  const mutation =
    existing != null
      ? supabase
          .from("daily_reports")
          .update({
            body: parsed.data.body,
            content: parsed.data.body,
            updated_by: user.id,
          })
          .eq("id", existing.id)
          .select("id, status")
          .single()
      : supabase
          .from("daily_reports")
          .insert({
            user_id: user.id,
            report_date: parsed.data.reportDate,
            body: parsed.data.body,
            content: parsed.data.body,
            status: "draft",
            created_by: user.id,
            updated_by: user.id,
          })
          .select("id, status")
          .single();

  const { data, error } = await mutation;
  if (error || !data) return fail("日報の保存に失敗しました。入力内容を確認してください。");

  const report = data as { id: string; status: string };
  const status = normalizeDailyReportStatus(report.status);
  await logAudit({
    userId: user.id,
    action: "daily_report.save",
    entityType: "daily_report",
    entityIdUuid: report.id,
    detail: {
      report_date: parsed.data.reportDate,
      previous_status: existing?.status ?? null,
      next_status: status,
      body_length: parsed.data.body.length,
    },
  });

  revalidatePath("/calendar");
  return ok({ id: report.id, status });
}

export async function submitDailyReport(
  input: DailyReportSubmitInput,
): Promise<ActionResult<{ id: string; status: CalendarDailyReportStatus }>> {
  const parsed = DailyReportSubmitSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(first?.message ?? "日報の入力内容を確認してください。", first?.path.join("."));
  }

  const user = await requireUser();
  const existingRes = await getDailyReportMutationTarget(parsed.data.reportDate, user);
  if (!existingRes.ok) return fail(existingRes.error, existingRes.field);

  const supabase = await createClient();
  const existing = existingRes.data;
  const submittedAt = new Date().toISOString();
  const mutation =
    existing != null
      ? supabase
          .from("daily_reports")
          .update({
            body: parsed.data.body,
            content: parsed.data.body,
            status: "submitted",
            submitted_at: submittedAt,
            lark_notified_at: null,
            updated_by: user.id,
          })
          .eq("id", existing.id)
          .select("id, status")
          .single()
      : supabase
          .from("daily_reports")
          .insert({
            user_id: user.id,
            report_date: parsed.data.reportDate,
            body: parsed.data.body,
            content: parsed.data.body,
            status: "submitted",
            submitted_at: submittedAt,
            lark_notified_at: null,
            created_by: user.id,
            updated_by: user.id,
          })
          .select("id, status")
          .single();

  const { data, error } = await mutation;
  if (error || !data) return fail("日報の提出に失敗しました。入力内容を確認してください。");

  const report = data as { id: string; status: string };
  const status = normalizeDailyReportStatus(report.status);
  await logAudit({
    userId: user.id,
    action: "daily_report.submit",
    entityType: "daily_report",
    entityIdUuid: report.id,
    detail: {
      report_date: parsed.data.reportDate,
      previous_status: existing?.status ?? null,
      next_status: status,
      submitted_at: submittedAt,
      body_length: parsed.data.body.length,
    },
  });

  const notification = await notifyDailyReportSubmitted(report.id);
  if (notification.status === "failed") {
    console.warn("[lark] daily report notification failed", {
      reportId: report.id,
      message: notification.message,
    });
  }

  revalidatePath("/calendar");
  return ok({ id: report.id, status });
}

export async function createDailyReportComment(
  input: DailyReportCommentInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = DailyReportCommentSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(first?.message ?? "コメントの入力内容を確認してください。", first?.path.join("."));
  }

  const user = await requireUser();
  const supabase = await createClient();
  const { data: report, error: reportError } = await supabase
    .from("daily_reports")
    .select("id")
    .eq("id", parsed.data.reportId)
    .maybeSingle();

  if (reportError) return fail("日報の確認に失敗しました。時間をおいて再度お試しください。");
  if (!report) return fail("日報が見つかりません。保存後に再度お試しください。");

  const { data, error } = await supabase
    .from("comments")
    .insert({
      target_type: "daily_report",
      target_id: parsed.data.reportId,
      user_id: user.id,
      body: parsed.data.body,
    })
    .select("id")
    .single();

  if (error || !data) return fail("コメントの投稿に失敗しました。時間をおいて再度お試しください。");

  const comment = data as { id: string };
  await logAudit({
    userId: user.id,
    action: "comment.create",
    entityType: "comment",
    entityIdUuid: comment.id,
    detail: { target_type: "daily_report", target_id: parsed.data.reportId },
  });

  revalidatePath("/calendar");
  return ok({ id: comment.id });
}

export async function moveSchedule(
  input: ScheduleMoveInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = ScheduleMoveSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "予定の移動内容が正しくありません。");
  }

  const user = await requireUser();
  const supabase = await createClient();
  const { data: existing, error: selectError } = await supabase
    .from("schedules")
    .select("id, title, start_at, end_at, user_id, created_by")
    .eq("id", parsed.data.scheduleId)
    .is("deleted_at", null)
    .maybeSingle();

  if (selectError) return fail("予定の確認に失敗しました。時間をおいて再度お試しください。");
  if (!existing) return fail("予定が見つかりません。再読み込みして確認してください。");

  const schedule = existing as MoveTargetRow;
  if (!canManageSchedule(user, schedule)) {
    return fail("他の社員の予定は移動できません。管理者に依頼してください。");
  }

  const { error } = await supabase
    .from("schedules")
    .update({
      start_at: parsed.data.startAt,
      end_at: parsed.data.endAt,
      user_id: parsed.data.userId,
      updated_by: user.id,
      sync_source: "app",
      sync_status: "pending",
      sync_error: null,
      last_synced_at: null,
    })
    .eq("id", parsed.data.scheduleId);

  if (error) return fail("予定の移動に失敗しました。権限と入力内容を確認してください。");

  await logAudit({
    userId: user.id,
    action: "schedule.update",
    entityType: "schedule",
    entityIdUuid: parsed.data.scheduleId,
    detail: {
      action: "moveSchedule",
      before: {
        start_at: schedule.start_at,
        end_at: schedule.end_at,
        user_id: schedule.user_id,
      },
      after: {
        start_at: parsed.data.startAt,
        end_at: parsed.data.endAt,
        user_id: parsed.data.userId,
      },
    },
  });

  revalidatePath("/calendar");
  return ok({ id: parsed.data.scheduleId });
}
