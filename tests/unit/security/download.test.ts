import { describe, expect, it } from "vitest";
import {
  attachmentHeaders,
  parsePositiveInteger,
  parsePositiveIntegerList,
  sanitizeDownloadFileName,
} from "@/lib/security/download";

describe("security/download", () => {
  it("parses only safe positive integer ids", () => {
    expect(parsePositiveInteger("12")).toBe(12);
    expect(parsePositiveInteger("0")).toBeNull();
    expect(parsePositiveInteger("-1")).toBeNull();
    expect(parsePositiveInteger("1.5")).toBeNull();
    expect(parsePositiveInteger("abc")).toBeNull();
  });

  it("deduplicates and limits id lists", () => {
    expect(parsePositiveIntegerList("1,2,2,3,999", 3)).toEqual([1, 2, 3]);
    expect(parsePositiveIntegerList("x,0,-1,4", 10)).toEqual([4]);
  });

  it("removes path separators and control characters from filenames", () => {
    expect(sanitizeDownloadFileName("../顧客\r\n情報/secret.xlsx", "download")).toBe(
      "_顧客情報_secret.xlsx",
    );
    expect(sanitizeDownloadFileName("   ", "download")).toBe("download");
  });

  it("sets private attachment headers", () => {
    const headers = attachmentHeaders("application/zip", "../帳票.zip") as Record<string, string>;
    expect(headers["Cache-Control"]).toContain("no-store");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Content-Disposition"]).toContain('filename="download"');
    expect(headers["Content-Disposition"]).toContain(encodeURIComponent("帳票.zip"));
  });
});
