import { describe, expect, it } from "vitest";

import { resolveRoute } from "./routing";

const ROOT = "example.com";

describe("resolveRoute", () => {
  it.each([
    ["example.com", "/", "/marketing", "marketing"],
    ["www.example.com", "/pricing", "/marketing/pricing", "marketing"],
    ["app.example.com", "/", "/panel", "app"],
    ["app.example.com", "/dashboard", "/panel/dashboard", "app"],
    ["admin.example.com", "/", "/admin", "admin"],
    ["admin.example.com", "/login", "/admin/login", "admin"],
    ["jan.example.com", "/", "/sites/jan.example.com", "site"],
    ["jan.example.com", "/o-mnie", "/sites/jan.example.com/o-mnie", "site"],
    ["www.jan-kowalski.pl", "/", "/sites/www.jan-kowalski.pl", "customDomain"],
  ])("%s%s -> %s", (host, path, rewritten, target) => {
    expect(resolveRoute(host, path, ROOT)).toEqual({ action: "rewrite", pathname: rewritten, target });
  });

  it("passes platform API routes through on platform hosts", () => {
    expect(resolveRoute("app.example.com", "/api/auth/session", ROOT)).toEqual({
      action: "next",
      target: "app",
    });
    expect(resolveRoute("admin.example.com", "/api/auth/csrf", ROOT)).toEqual({
      action: "next",
      target: "admin",
    });
  });

  it("serves template previews on platform hosts only", () => {
    expect(resolveRoute("app.example.com", "/template-preview/fotograf", ROOT).action).toBe("next");
    expect(resolveRoute("example.com", "/template-preview/fotograf", ROOT).action).toBe("next");
    expect(resolveRoute("jan.example.com", "/template-preview/fotograf", ROOT)).toMatchObject({
      action: "rewrite",
    });
  });

  it("serves the health check and local media on any host", () => {
    expect(resolveRoute("10.0.0.5:3000", "/api/health", ROOT).action).toBe("next");
    expect(resolveRoute("jan.example.com", "/storage/u/1/a.webp", ROOT).action).toBe("next");
    expect(resolveRoute("app.example.com", "/storage/u/1/a.webp", ROOT).action).toBe("next");
  });

  it("never exposes platform APIs on client hosts", () => {
    expect(resolveRoute("jan.example.com", "/api/auth/session", ROOT)).toEqual({ action: "notFound" });
    expect(resolveRoute("jan-kowalski.pl", "/api/email/verify", ROOT)).toEqual({ action: "notFound" });
  });

  it("cannot reach internal routes of another host", () => {
    expect(resolveRoute("jan.example.com", "/panel/dashboard", ROOT)).toEqual({
      action: "rewrite",
      pathname: "/sites/jan.example.com/panel/dashboard",
      target: "site",
    });
    expect(resolveRoute("app.example.com", "/admin", ROOT)).toEqual({
      action: "rewrite",
      pathname: "/panel/admin",
      target: "app",
    });
  });

  it.each([
    ["api.example.com", "/"],
    [null, "/"],
  ])("returns 404 for host %j", (host, path) => {
    expect(resolveRoute(host, path, ROOT)).toEqual({ action: "notFound" });
  });
});
