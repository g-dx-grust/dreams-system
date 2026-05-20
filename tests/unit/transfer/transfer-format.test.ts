import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFileName, buildStorageFileName } from "@/lib/transfer/transfer-format";

describe("transfer-format", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the Japan local date for generated document filenames", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-19T17:47:00.000Z"));

    expect(buildFileName("2026-LI-002", "通知書", 1, "docx")).toBe(
      "2026-LI-002_通知書_20260520_v1.docx",
    );
    expect(buildStorageFileName("2026-LI-002", 70, 1, "docx")).toBe(
      "2026-LI-002_template-70_20260520_v1.docx",
    );
  });
});
