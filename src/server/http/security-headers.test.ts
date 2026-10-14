import { describe, expect, it } from "vitest";

import { siteContentSecurityPolicy } from "./security-headers";

describe("siteContentSecurityPolicy", () => {
  it("forbids plugins, framing and foreign scripts", () => {
    const csp = siteContentSecurityPolicy(false);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline';");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("allows a plain-http media origin (local MinIO) only when given", () => {
    expect(siteContentSecurityPolicy(false, "http://localhost:9000")).toContain(
      "img-src 'self' data: blob: https: http://localhost:9000",
    );
    expect(siteContentSecurityPolicy(false, "https://cdn.example.com")).toContain(
      "img-src 'self' data: blob: https:;",
    );
  });
});
