export const APP_TIME_ZONE = "Asia/Tokyo";

const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DATE_TIME_WITH_SECONDS_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatTokyoDate(value: string | null | undefined): string {
  if (!value) return "—";
  return DATE_FORMAT.format(new Date(value));
}

export function formatTokyoDateTime(
  value: string | null | undefined,
  options: { seconds?: boolean } = {},
): string {
  if (!value) return "—";
  return (options.seconds ? DATE_TIME_WITH_SECONDS_FORMAT : DATE_TIME_FORMAT).format(
    new Date(value),
  );
}

export function todayTokyoDateKey(): string {
  return dateKeyInTokyo(new Date());
}

export function tokyoDateKeyAfterDays(days: number, base: Date = new Date()): string {
  return dateKeyInTokyo(new Date(base.getTime() + days * DAY_MS));
}

export function dateKeyInTokyo(value: Date): string {
  const parts = DATE_FORMAT.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function monthKeyInTokyo(value: Date): string {
  return dateKeyInTokyo(value).slice(0, 7);
}

export function tokyoMonthKeyOffset(monthOffset: number, base: Date = new Date()): string {
  const parts = parseDateKey(dateKeyInTokyo(base));
  if (!parts) return monthKeyInTokyo(base);
  return dateKeyInTokyo(
    new Date(Date.UTC(parts.year, parts.month - 1 + monthOffset, 1, -9, 0, 0, 0)),
  ).slice(0, 7);
}

export function toTokyoDayStartIso(dateKey: string | null | undefined): string | null {
  const parts = parseDateKey(dateKey);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, -9, 0, 0, 0)).toISOString();
}

export function toTokyoNextDayStartIso(dateKey: string | null | undefined): string | null {
  const parts = parseDateKey(dateKey);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, -9, 0, 0, 0)).toISOString();
}

function parseDateKey(
  value: string | null | undefined,
): { year: number; month: number; day: number } | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}
