import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildLarkCalendarEventPayload,
  createLarkCalendarEvent,
  deleteLarkCalendarEvent,
  getLarkCalendarEvent,
  updateLarkCalendarEvent,
  type LarkCalendarEvent,
} from "@/lib/lark/calendar";
import { isLarkApiConfigured } from "@/lib/lark/client";
import { sendLarkTextMessage, type LarkReceiveIdType } from "@/lib/lark/messages";

type ScheduleSyncRow = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  user_id: string | null;
  case_number: string | null;
  location: string | null;
  memo: string | null;
  lark_calendar_id: string | null;
  lark_event_id: string | null;
  lark_event_etag: string | null;
  sync_status: string;
  sync_source: string;
  deleted_at: string | null;
};

type DailyReportNotificationRow = {
  id: string;
  user_id: string;
  report_date: string;
  status: string;
  submitted_at: string | null;
  lark_notified_at: string | null;
  users:
    | { full_name: string | null; email: string }
    | Array<{ full_name: string | null; email: string }>
    | null;
};

export type LarkSyncItemResult = {
  scheduleId: string;
  status: "synced" | "failed" | "ignored" | "skipped";
  message?: string;
};

export type LarkSyncSummary = {
  processed: number;
  synced: number;
  failed: number;
  ignored: number;
  skipped: number;
  items: LarkSyncItemResult[];
};

export type LarkWebhookSyncResult = {
  status: "synced" | "failed" | "skipped";
  scheduleId?: string;
  message?: string;
};

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function truncate(value: string, max = 1000): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function appUrl(): string | null {
  return optionalEnv("NEXT_PUBLIC_APP_URL");
}

function defaultCalendarId(): string | null {
  return optionalEnv("LARK_CALENDAR_ID");
}

function dailyReportChatConfig(): { receiveId: string; receiveIdType: LarkReceiveIdType } | null {
  const receiveId = optionalEnv("LARK_DAILY_REPORT_CHAT_ID");
  if (!receiveId) return null;

  const rawType = optionalEnv("LARK_DAILY_REPORT_RECEIVE_ID_TYPE") ?? "chat_id";
  const receiveIdType: LarkReceiveIdType =
    rawType === "open_id" || rawType === "user_id" || rawType === "email" ? rawType : "chat_id";
  return { receiveId, receiveIdType };
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function userName(report: DailyReportNotificationRow): string {
  const user = firstRelation(report.users);
  return user?.full_name || user?.email || "未登録ユーザー";
}

function formatTokyoDateTime(value: string | null): string {
  if (!value) return "未記録";
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

function schedulePayload(schedule: ScheduleSyncRow) {
  return buildLarkCalendarEventPayload({
    id: schedule.id,
    title: schedule.title,
    startAt: schedule.start_at,
    endAt: schedule.end_at,
    location: schedule.location,
    memo: schedule.memo,
    caseNumber: schedule.case_number,
    appUrl: appUrl(),
  });
}

async function markScheduleSyncResult(
  scheduleId: string,
  status: "synced" | "failed" | "ignored",
  fields: {
    larkCalendarId?: string | null;
    larkEventId?: string | null;
    larkEventEtag?: string | null;
    syncError?: string | null;
    syncSource?: "app" | "lark";
  } = {},
) {
  const supabase = createAdminClient();
  await supabase
    .from("schedules")
    .update({
      sync_status: status,
      sync_source: fields.syncSource ?? "app",
      sync_error: fields.syncError ? truncate(fields.syncError) : null,
      last_synced_at: new Date().toISOString(),
      ...(fields.larkCalendarId !== undefined ? { lark_calendar_id: fields.larkCalendarId } : {}),
      ...(fields.larkEventId !== undefined ? { lark_event_id: fields.larkEventId } : {}),
      ...(fields.larkEventEtag !== undefined ? { lark_event_etag: fields.larkEventEtag } : {}),
    })
    .eq("id", scheduleId);
}

async function syncDeletedSchedule(schedule: ScheduleSyncRow): Promise<LarkSyncItemResult> {
  const calendarId = schedule.lark_calendar_id ?? defaultCalendarId();
  if (!schedule.lark_event_id || !calendarId) {
    await markScheduleSyncResult(schedule.id, "ignored", {
      syncError: "Lark側に削除対象の日程IDがありません。",
    });
    return { scheduleId: schedule.id, status: "ignored" };
  }

  const deleted = await deleteLarkCalendarEvent(calendarId, schedule.lark_event_id);
  if (!deleted.ok) {
    await markScheduleSyncResult(schedule.id, "failed", { syncError: deleted.error });
    return { scheduleId: schedule.id, status: "failed", message: deleted.error };
  }

  await markScheduleSyncResult(schedule.id, "synced", {
    larkCalendarId: calendarId,
    larkEventId: schedule.lark_event_id,
    larkEventEtag: null,
  });
  return { scheduleId: schedule.id, status: "synced" };
}

async function syncActiveSchedule(schedule: ScheduleSyncRow): Promise<LarkSyncItemResult> {
  const calendarId = schedule.lark_calendar_id ?? defaultCalendarId();
  if (!calendarId) {
    const message = "LARK_CALENDAR_IDが未設定です。";
    await markScheduleSyncResult(schedule.id, "failed", { syncError: message });
    return { scheduleId: schedule.id, status: "failed", message };
  }

  const payload = schedulePayload(schedule);
  const result =
    schedule.lark_event_id != null
      ? await updateLarkCalendarEvent(calendarId, schedule.lark_event_id, payload)
      : await createLarkCalendarEvent(calendarId, payload);

  if (!result.ok) {
    await markScheduleSyncResult(schedule.id, "failed", { syncError: result.error });
    return { scheduleId: schedule.id, status: "failed", message: result.error };
  }

  await markScheduleSyncResult(schedule.id, "synced", {
    larkCalendarId: result.data.calendarId ?? calendarId,
    larkEventId: result.data.eventId,
    larkEventEtag: result.data.etag,
  });
  return { scheduleId: schedule.id, status: "synced" };
}

export async function syncPendingSchedulesToLark(limit = 50): Promise<LarkSyncSummary> {
  const summary: LarkSyncSummary = {
    processed: 0,
    synced: 0,
    failed: 0,
    ignored: 0,
    skipped: 0,
    items: [],
  };

  if (!isLarkApiConfigured()) {
    return {
      ...summary,
      items: [
        {
          scheduleId: "configuration",
          status: "skipped",
          message: "LARK_APP_IDとLARK_APP_SECRETが未設定です。",
        },
      ],
      skipped: 1,
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("schedules")
    .select(
      "id, title, start_at, end_at, user_id, case_number, location, memo, lark_calendar_id, lark_event_id, lark_event_etag, sync_status, sync_source, deleted_at",
    )
    .eq("sync_status", "pending")
    .eq("sync_source", "app")
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    return {
      ...summary,
      failed: 1,
      items: [{ scheduleId: "query", status: "failed", message: error.message }],
    };
  }

  for (const row of (data ?? []) as ScheduleSyncRow[]) {
    summary.processed += 1;
    const item = row.deleted_at ? await syncDeletedSchedule(row) : await syncActiveSchedule(row);
    summary.items.push(item);
    summary[item.status] += 1;
  }

  return summary;
}

function scheduleFieldsFromLark(event: LarkCalendarEvent) {
  return {
    title: event.summary,
    start_at: event.startAt,
    end_at: event.endAt,
    location: event.location,
    memo: event.description,
    lark_calendar_id: event.calendarId,
    lark_event_id: event.eventId,
    lark_event_etag: event.etag,
    sync_source: "lark",
    sync_status: "synced",
    sync_error: null,
    last_synced_at: new Date().toISOString(),
  };
}

export async function syncLarkCalendarEventToDatabase(input: {
  calendarId: string;
  eventId: string;
}): Promise<LarkWebhookSyncResult> {
  if (!isLarkApiConfigured()) {
    return { status: "skipped", message: "Lark API環境変数が未設定です。" };
  }

  const larkEvent = await getLarkCalendarEvent(input.calendarId, input.eventId);
  if (!larkEvent.ok) return { status: "failed", message: larkEvent.error };

  const supabase = createAdminClient();
  const { data: existing, error: selectError } = await supabase
    .from("schedules")
    .select("id, sync_source, sync_status")
    .eq("lark_calendar_id", input.calendarId)
    .eq("lark_event_id", input.eventId)
    .maybeSingle();

  if (selectError) return { status: "failed", message: selectError.message };

  const fields = scheduleFieldsFromLark(larkEvent.data);
  if (existing) {
    const row = existing as { id: string; sync_source: string; sync_status: string };
    if (row.sync_source === "app" && row.sync_status === "pending") {
      return {
        status: "skipped",
        scheduleId: row.id,
        message: "アプリ側の未同期変更があるためLark webhookを保留しました。",
      };
    }

    const { error } = await supabase.from("schedules").update(fields).eq("id", row.id);
    if (error) return { status: "failed", scheduleId: row.id, message: error.message };
    return { status: "synced", scheduleId: row.id };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("schedules")
    .insert({
      ...fields,
      co_user_ids: [],
      status: "planned",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return {
      status: "failed",
      message: insertError?.message ?? "Lark日程の取り込みに失敗しました。",
    };
  }

  return { status: "synced", scheduleId: (inserted as { id: string }).id };
}

export async function notifyDailyReportSubmitted(reportId: string): Promise<LarkSyncItemResult> {
  const chatConfig = dailyReportChatConfig();
  if (!chatConfig) {
    return {
      scheduleId: reportId,
      status: "skipped",
      message: "LARK_DAILY_REPORT_CHAT_IDが未設定です。",
    };
  }

  if (!isLarkApiConfigured()) {
    return {
      scheduleId: reportId,
      status: "skipped",
      message: "LARK_APP_IDとLARK_APP_SECRETが未設定です。",
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("daily_reports")
    .select(
      "id, user_id, report_date, status, submitted_at, lark_notified_at, users (full_name, email)",
    )
    .eq("id", reportId)
    .maybeSingle();

  if (error || !data) {
    return {
      scheduleId: reportId,
      status: "failed",
      message: error?.message ?? "日報が見つかりません。",
    };
  }

  const report = data as DailyReportNotificationRow;
  if (report.status !== "submitted") {
    return { scheduleId: reportId, status: "skipped", message: "日報は未提出です。" };
  }
  if (report.lark_notified_at) {
    return { scheduleId: reportId, status: "skipped", message: "通知済みです。" };
  }

  const calendarUrl = appUrl()
    ? `${appUrl()?.replace(/\/$/, "")}/calendar?date=${report.report_date}`
    : null;
  const text = [
    "日報が提出されました。",
    `提出者: ${userName(report)}`,
    `日付: ${report.report_date}`,
    `提出日時: ${formatTokyoDateTime(report.submitted_at)}`,
    calendarUrl ? `確認URL: ${calendarUrl}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const sent = await sendLarkTextMessage({
    receiveId: chatConfig.receiveId,
    receiveIdType: chatConfig.receiveIdType,
    text,
  });

  if (!sent.ok) return { scheduleId: reportId, status: "failed", message: sent.error };

  await supabase
    .from("daily_reports")
    .update({ lark_notified_at: new Date().toISOString(), updated_by: report.user_id })
    .eq("id", reportId);

  return { scheduleId: reportId, status: "synced" };
}

export function isAuthorizedLarkSyncRequest(request: Request): boolean {
  const secret = optionalEnv("LARK_SYNC_SECRET");
  if (!secret) return false;

  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-lark-sync-secret");
  return authorization === `Bearer ${secret}` || headerSecret === secret;
}
