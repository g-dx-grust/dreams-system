import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatTokyoDate,
  formatTokyoDateTime,
  todayTokyoDateKey,
  tokyoDateKeyAfterDays,
  tokyoMonthKeyOffset,
  toTokyoDayStartIso,
  toTokyoNextDayStartIso,
} from "@/lib/date-time";

describe("date-time", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats timestamps in Asia/Tokyo", () => {
    const value = "2026-06-25T15:30:00.000Z";

    expect(formatTokyoDate(value)).toBe("2026/06/26");
    expect(formatTokyoDateTime(value)).toBe("2026/06/26 00:30");
    expect(formatTokyoDateTime(value, { seconds: true })).toBe("2026/06/26 00:30:00");
  });

  it("creates today and future date keys from the Tokyo calendar day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T15:30:00.000Z"));

    expect(todayTokyoDateKey()).toBe("2026-06-26");
    expect(tokyoDateKeyAfterDays(7)).toBe("2026-07-03");
  });

  it("creates month keys from the Tokyo calendar month", () => {
    const base = new Date("2026-06-30T15:30:00.000Z");

    expect(tokyoMonthKeyOffset(0, base)).toBe("2026-07");
    expect(tokyoMonthKeyOffset(-1, base)).toBe("2026-06");
  });

  it("converts Tokyo date keys to UTC range boundaries", () => {
    expect(toTokyoDayStartIso("2026-06-26")).toBe("2026-06-25T15:00:00.000Z");
    expect(toTokyoNextDayStartIso("2026-06-26")).toBe("2026-06-26T15:00:00.000Z");
  });
});
