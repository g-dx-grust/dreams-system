export type LarkCalendarEventRef = {
  calendarId: string;
  eventId: string;
  eventType: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function findStringDeep(value: unknown, keys: readonly string[]): string | null {
  if (!isRecord(value)) return null;

  for (const key of keys) {
    const direct = optionalString(value[key]);
    if (direct) return direct;
  }

  for (const item of Object.values(value)) {
    if (isRecord(item)) {
      const nested = findStringDeep(item, keys);
      if (nested) return nested;
    }
  }

  return null;
}

export function getLarkWebhookToken(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const header = isRecord(payload.header) ? payload.header : null;
  return optionalString(payload.token) ?? optionalString(header?.token);
}

export function resolveLarkUrlVerification(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (payload.type !== "url_verification") return null;
  return optionalString(payload.challenge);
}

export function extractLarkCalendarEventRef(payload: unknown): LarkCalendarEventRef | null {
  if (!isRecord(payload)) return null;

  const header = isRecord(payload.header) ? payload.header : null;
  const event = isRecord(payload.event) ? payload.event : payload;
  const eventType = optionalString(header?.event_type) ?? optionalString(payload.type);
  const calendarId = findStringDeep(event, ["calendar_id"]);
  const eventId = findStringDeep(event, ["event_id"]);

  if (!calendarId || !eventId) return null;
  return { calendarId, eventId, eventType };
}
