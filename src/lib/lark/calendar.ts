import { requestLarkWithTenantToken, type LarkResult } from "@/lib/lark/client";

export const LARK_CALENDAR_TIME_ZONE = "Asia/Tokyo";

export type LarkEventTime = {
  timestamp: string;
  timezone: string;
};

export type LarkCalendarEventPayload = {
  summary: string;
  description?: string;
  need_notification: boolean;
  start_time: LarkEventTime;
  end_time: LarkEventTime;
  visibility: "default";
  free_busy_status: "busy";
  location?: { name: string };
};

export type LarkCalendarEvent = {
  eventId: string;
  calendarId: string | null;
  summary: string;
  description: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  etag: string | null;
};

type LarkEventResponseData = {
  event?: unknown;
};

export type LarkSchedulePayloadInput = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  memo: string | null;
  caseNumber: string | null;
  appUrl: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function timestampSeconds(value: string): string {
  return String(Math.floor(new Date(value).getTime() / 1000));
}

function isoFromEventTime(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const timestamp = optionalString(value.timestamp);
  if (!timestamp) return null;
  const millis = Number(timestamp) * 1000;
  if (!Number.isFinite(millis)) return null;
  return new Date(millis).toISOString();
}

function parseLarkEvent(value: unknown): LarkCalendarEvent | null {
  if (!isRecord(value)) return null;

  const eventId = optionalString(value.event_id);
  const summary = optionalString(value.summary);
  const startAt = isoFromEventTime(value.start_time);
  const endAt = isoFromEventTime(value.end_time);
  if (!eventId || !summary || !startAt || !endAt) return null;

  const organizerCalendarId = optionalString(value.organizer_calendar_id);
  const calendarId = optionalString(value.calendar_id) ?? organizerCalendarId;
  const location = isRecord(value.location) ? optionalString(value.location.name) : null;

  return {
    eventId,
    calendarId,
    summary,
    description: optionalString(value.description),
    startAt,
    endAt,
    location,
    etag: optionalString(value.etag),
  };
}

function formatTokyoDate(value: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: LARK_CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function appScheduleUrl(appUrl: string | null, scheduleId: string, startAt: string): string | null {
  if (!appUrl) return null;
  const base = appUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    date: formatTokyoDate(startAt),
    view: "day",
    schedule: scheduleId,
  });
  return `${base}/calendar?${params.toString()}`;
}

export function buildLarkCalendarEventPayload(
  input: LarkSchedulePayloadInput,
): LarkCalendarEventPayload {
  const scheduleUrl = appScheduleUrl(input.appUrl, input.id, input.startAt);
  const descriptionParts = [
    input.caseNumber ? `案件番号: ${input.caseNumber}` : null,
    input.memo,
    scheduleUrl ? `dreaMs: ${scheduleUrl}` : null,
  ].filter((part): part is string => Boolean(part));

  return {
    summary: input.title,
    description: descriptionParts.join("\n\n") || undefined,
    need_notification: false,
    start_time: {
      timestamp: timestampSeconds(input.startAt),
      timezone: LARK_CALENDAR_TIME_ZONE,
    },
    end_time: {
      timestamp: timestampSeconds(input.endAt),
      timezone: LARK_CALENDAR_TIME_ZONE,
    },
    visibility: "default",
    free_busy_status: "busy",
    ...(input.location ? { location: { name: input.location } } : {}),
  };
}

export async function createLarkCalendarEvent(
  calendarId: string,
  payload: LarkCalendarEventPayload,
): Promise<LarkResult<LarkCalendarEvent>> {
  const data = await requestLarkWithTenantToken<LarkEventResponseData>(
    `/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      body: payload,
    },
  );
  if (!data.ok) return data;

  const event = parseLarkEvent(data.data.event);
  if (!event) return { ok: false, error: "Lark日程作成の応答にevent_idが含まれていません。" };
  return { ok: true, data: { ...event, calendarId: event.calendarId ?? calendarId } };
}

export async function updateLarkCalendarEvent(
  calendarId: string,
  eventId: string,
  payload: LarkCalendarEventPayload,
): Promise<LarkResult<LarkCalendarEvent>> {
  const data = await requestLarkWithTenantToken<LarkEventResponseData>(
    `/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      body: payload,
    },
  );
  if (!data.ok) return data;

  const event = parseLarkEvent(data.data.event);
  if (!event) return { ok: false, error: "Lark日程更新の応答にevent_idが含まれていません。" };
  return { ok: true, data: { ...event, calendarId: event.calendarId ?? calendarId } };
}

export async function deleteLarkCalendarEvent(
  calendarId: string,
  eventId: string,
): Promise<LarkResult<{ id: string }>> {
  const query = new URLSearchParams();
  query.set("need_notification", "false");

  const data = await requestLarkWithTenantToken<Record<string, never>>(
    `/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", query },
  );
  if (!data.ok) return data;
  return { ok: true, data: { id: eventId } };
}

export async function getLarkCalendarEvent(
  calendarId: string,
  eventId: string,
): Promise<LarkResult<LarkCalendarEvent>> {
  const data = await requestLarkWithTenantToken<LarkEventResponseData>(
    `/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "GET" },
  );
  if (!data.ok) return data;

  const event = parseLarkEvent(data.data.event);
  if (!event) return { ok: false, error: "Lark日程取得の応答にevent_idが含まれていません。" };
  return { ok: true, data: { ...event, calendarId: event.calendarId ?? calendarId } };
}
