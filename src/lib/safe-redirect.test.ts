import { describe, expect, it } from "vitest";

import { safeCallbackUrl } from "./safe-redirect";

describe("safeCallbackUrl", () => {
  it.each(["/dashboard", "/admin?tab=users", "/sites/abc#top"])("accepts relative path %s", (value) => {
    expect(safeCallbackUrl(value)).toBe(value);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "dashboard",
    "/foo\nbar",
    "",
    null,
    42,
  ])("falls back for unsafe value %s", (value) => {
    expect(safeCallbackUrl(value)).toBe("/dashboard");
  });

  it("uses the provided fallback", () => {
    expect(safeCallbackUrl("//x", "/admin")).toBe("/admin");
  });
});
