import { describe, expect, it } from "vitest";
import { buildLarkCalendarEventPayload } from "@/lib/lark/calendar";
import {
  extractLarkCalendarEventRef,
  getLarkWebhookToken,
  resolveLarkUrlVerification,
} from "@/lib/lark/events";

describe("buildLarkCalendarEventPayload", () => {
  it("builds a token-safe calendar event payload from a schedule", () => {
    const payload = buildLarkCalendarEventPayload({
      id: "8e9bce7b-5d14-4618-92b6-7ffde4a7d73d",
      title: "現地調査",
      startAt: "2026-06-18T00:00:00.000Z",
      endAt: "2026-06-18T01:00:00.000Z",
      location: "豊橋市役所",
      memo: "土地境界の確認",
      caseNumber: "GD-2026-001",
      appUrl: "https://dreams.example.test",
    });

    expect(payload).toMatchObject({
      summary: "現地調査",
      need_notification: false,
      visibility: "default",
      free_busy_status: "busy",
      start_time: { timestamp: "1781740800", timezone: "Asia/Tokyo" },
      end_time: { timestamp: "1781744400", timezone: "Asia/Tokyo" },
      location: { name: "豊橋市役所" },
    });
    expect(payload.description).toContain("案件番号: GD-2026-001");
    expect(payload.description).toContain(
      "dreaMs: https://dreams.example.test/calendar?date=2026-06-18&view=day&schedule=8e9bce7b-5d14-4618-92b6-7ffde4a7d73d",
    );
  });
});

describe("Lark event payload helpers", () => {
  it("handles URL verification payloads", () => {
    expect(
      resolveLarkUrlVerification({
        type: "url_verification",
        token: "verify-token",
        challenge: "challenge-value",
      }),
    ).toBe("challenge-value");
  });

  it("extracts token and event ref from v2 calendar events", () => {
    const payload = {
      schema: "2.0",
      header: {
        token: "verify-token",
        event_type: "calendar.calendar.event.changed_v4",
      },
      event: {
        calendar_id: "larksuite.com_xxx@group.calendar.larksuite.com",
        event_id: "event_xxx_0",
      },
    };

    expect(getLarkWebhookToken(payload)).toBe("verify-token");
    expect(extractLarkCalendarEventRef(payload)).toEqual({
      calendarId: "larksuite.com_xxx@group.calendar.larksuite.com",
      eventId: "event_xxx_0",
      eventType: "calendar.calendar.event.changed_v4",
    });
  });
});
