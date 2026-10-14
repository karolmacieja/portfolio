import { describe, expect, it } from "vitest";

import { classifyHost, normalizeHostname } from "./hosts";

describe("normalizeHostname", () => {
  it.each([
    ["Jan.Example.COM", "jan.example.com"],
    ["jan.localhost:3000", "jan.localhost"],
    ["example.com.", "example.com"],
    ["localhost", "localhost"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });

  it.each([null, "", "exa mple.com", "evil.com/x", "a@b.com", "host:port", "-bad.com", "bad-.com"])(
    "rejects %j",
    (input) => {
      expect(normalizeHostname(input)).toBeNull();
    },
  );
});

describe("classifyHost", () => {
  const root = "example.com";

  it.each([
    ["example.com", { kind: "marketing" }],
    ["www.example.com", { kind: "marketing" }],
    ["app.example.com", { kind: "app" }],
    ["admin.example.com", { kind: "admin" }],
    ["jan.example.com", { kind: "site", hostname: "jan.example.com", slug: "jan" }],
    ["JAN.example.com:443", { kind: "site", hostname: "jan.example.com", slug: "jan" }],
    ["jan-kowalski.pl", { kind: "customDomain", hostname: "jan-kowalski.pl" }],
    ["www.jan-kowalski.pl", { kind: "customDomain", hostname: "www.jan-kowalski.pl" }],
  ])("%s", (host, expected) => {
    expect(classifyHost(host, root)).toEqual(expected);
  });

  it("resolves deeper subdomains like custom domains", () => {
    expect(classifyHost("a.b.example.com", root)).toEqual({
      kind: "customDomain",
      hostname: "a.b.example.com",
    });
  });

  it.each(["api.example.com", "mail.example.com", "xn--abc.example.com", "", "bad host"])(
    "treats %j as invalid",
    (host) => {
      expect(classifyHost(host, root)).toEqual({ kind: "invalid" });
    },
  );

  it("supports a root domain with a port (local development)", () => {
    expect(classifyHost("localhost:3000", "localhost:3000")).toEqual({ kind: "marketing" });
    expect(classifyHost("app.localhost:3000", "localhost:3000")).toEqual({ kind: "app" });
    expect(classifyHost("jan.localhost:3000", "localhost:3000")).toEqual({
      kind: "site",
      hostname: "jan.localhost",
      slug: "jan",
    });
  });

  it("does not treat look-alike domains as subdomains", () => {
    expect(classifyHost("jan.notexample.com", root)).toEqual({
      kind: "customDomain",
      hostname: "jan.notexample.com",
    });
    expect(classifyHost("example.com.evil.net", root)).toEqual({
      kind: "customDomain",
      hostname: "example.com.evil.net",
    });
  });
});
