import { describe, expect, it } from "vitest";

import { getClientIp, getRequestOrigin } from "./request";

describe("getClientIp", () => {
  it("uses the entry appended by the single trusted proxy", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" });
    expect(getClientIp(headers, 1)).toBe("203.0.113.7");
  });

  it("skips entries added by additional trusted proxies", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.0.0.2" });
    expect(getClientIp(headers, 2)).toBe("203.0.113.7");
  });

  it("clamps to the first entry when there are fewer entries than hops", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }), 3)).toBe("203.0.113.7");
  });

  it("ignores X-Forwarded-For when no proxy is trusted", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "198.51.100.2" });
    expect(getClientIp(headers, 0)).toBe("198.51.100.2");
  });

  it("returns 'unknown' without proxy headers", () => {
    expect(getClientIp(new Headers(), 1)).toBe("unknown");
  });
});

describe("getRequestOrigin", () => {
  it("uses the Host header with the fallback protocol", () => {
    expect(getRequestOrigin(new Headers({ host: "app.localhost:3000" }), "http")).toBe(
      "http://app.localhost:3000",
    );
  });

  it("prefers X-Forwarded-Host and X-Forwarded-Proto set by the proxy", () => {
    const headers = new Headers({
      host: "127.0.0.1:3000",
      "x-forwarded-host": "Jan.Example.com",
      "x-forwarded-proto": "https",
    });
    expect(getRequestOrigin(headers, "http")).toBe("https://jan.example.com");
  });

  it("ignores an unknown forwarded protocol", () => {
    const headers = new Headers({ host: "example.com", "x-forwarded-proto": "javascript" });
    expect(getRequestOrigin(headers, "https")).toBe("https://example.com");
  });

  it.each(["evil.com/path", "evil.com@x", "", "a b"])("rejects malformed host %j", (host) => {
    expect(getRequestOrigin(new Headers(host ? { host } : {}), "https")).toBeNull();
  });
});
