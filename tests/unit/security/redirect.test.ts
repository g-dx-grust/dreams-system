import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/security/redirect";

describe("security/redirect", () => {
  it("allows same-origin relative paths", () => {
    expect(safeRedirectPath("/cases/1?tab=history#top")).toBe("/cases/1?tab=history#top");
  });

  it("rejects external and protocol-relative destinations", () => {
    expect(safeRedirectPath("https://example.com")).toBe("/");
    expect(safeRedirectPath("//example.com/path")).toBe("/");
    expect(safeRedirectPath(null, "/login")).toBe("/login");
  });
});
