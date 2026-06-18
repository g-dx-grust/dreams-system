import {
  extractLarkCalendarEventRef,
  getLarkWebhookToken,
  resolveLarkUrlVerification,
} from "@/lib/lark/events";
import { syncLarkCalendarEventToDatabase } from "@/server/lark-sync";

function verifyEventToken(payload: unknown): boolean {
  const expected = process.env.LARK_EVENT_VERIFY_TOKEN?.trim();
  if (!expected) return false;
  return getLarkWebhookToken(payload) === expected;
}

export async function POST(request: Request) {
  const payload = (await request.json()) as unknown;

  if (!verifyEventToken(payload)) {
    return Response.json(
      { ok: false, error: "Lark event tokenが正しくありません。" },
      { status: 401 },
    );
  }

  const challenge = resolveLarkUrlVerification(payload);
  if (challenge) {
    return Response.json({ challenge });
  }

  const ref = extractLarkCalendarEventRef(payload);
  if (!ref) {
    return Response.json({ ok: true, ignored: true });
  }

  const result = await syncLarkCalendarEventToDatabase({
    calendarId: ref.calendarId,
    eventId: ref.eventId,
  });

  const status = result.status === "failed" ? 502 : 200;
  return Response.json(
    { ok: result.status !== "failed", eventType: ref.eventType, result },
    { status },
  );
}
