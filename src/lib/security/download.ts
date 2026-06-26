const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const FILE_NAME_SEPARATORS = /[\\/:*?"<>|]/g;

export const PRIVATE_DOWNLOAD_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "X-Content-Type-Options": "nosniff",
} as const;

export function parsePositiveInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parsePositiveIntegerList(value: string | null, maxItems: number): number[] {
  if (!value) return [];
  const ids = new Set<number>();
  for (const part of value.split(",")) {
    const id = parsePositiveInteger(part.trim());
    if (id) ids.add(id);
    if (ids.size >= maxItems) break;
  }
  return Array.from(ids);
}

export function sanitizeDownloadFileName(
  value: string | null | undefined,
  fallback: string,
): string {
  const sanitized = (value ?? "")
    .normalize("NFKC")
    .replace(CONTROL_CHARS, "")
    .replace(FILE_NAME_SEPARATORS, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 180);

  return sanitized || fallback;
}

export function attachmentHeaders(contentType: string, fileName: string): HeadersInit {
  const safeFileName = sanitizeDownloadFileName(fileName, "download");
  return {
    ...PRIVATE_DOWNLOAD_HEADERS,
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(
      safeFileName,
    )}`,
  };
}
