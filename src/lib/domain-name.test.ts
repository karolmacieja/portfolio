import { describe, expect, it } from "vitest";

import { apexOf, isApexDomain, splitDomain, validateDomainName } from "./domain-name";

const prod = { rootDomain: "example.com" };
const dev = { rootDomain: "localhost:3000", allowLocalhost: true };

describe("validateDomainName", () => {
  it("normalizes hostnames, pasted URLs and IDN", () => {
    expect(validateDomainName(" WWW.Jan-Kowalski.PL. ", prod)).toEqual({
      ok: true,
      hostname: "www.jan-kowalski.pl",
    });
    expect(validateDomainName("https://jan.pl/portfolio?x=1", prod)).toEqual({
      ok: true,
      hostname: "jan.pl",
    });
    expect(validateDomainName("żółw.pl", prod)).toEqual({ ok: true, hostname: "xn--w-uga1v8h.pl" });
  });

  it("refuses invalid names, IPs, wildcards and the platform's own domain", () => {
    expect(validateDomainName("localhost", prod)).toMatchObject({ error: "missingTld" });
    expect(validateDomainName("jan", prod)).toMatchObject({ error: "missingTld" });
    expect(validateDomainName("-jan.pl", prod)).toMatchObject({ error: "invalid" });
    expect(validateDomainName("jan..pl", prod)).toMatchObject({ ok: false });
    expect(validateDomainName("jan.p1", prod)).toMatchObject({ error: "missingTld" });
    expect(validateDomainName("192.168.0.1", prod)).toMatchObject({ error: "ipAddress" });
    expect(validateDomainName("[::1]", prod)).toMatchObject({ error: "ipAddress" });
    expect(validateDomainName("*.jan.pl", prod)).toMatchObject({ error: "wildcard" });
    expect(validateDomainName("example.com", prod)).toMatchObject({ error: "platformDomain" });
    expect(validateDomainName("jan.example.com", prod)).toMatchObject({ error: "platformDomain" });
    expect(
      validateDomainName(`${Array.from({ length: 5 }, () => "a".repeat(60)).join(".")}.pl`, prod),
    ).toMatchObject({
      error: "tooLong",
    });
  });

  it("allows multi-label *.localhost hosts only in development", () => {
    expect(validateDomainName("moja-domena.pl.localhost", dev)).toEqual({
      ok: true,
      hostname: "moja-domena.pl.localhost",
    });
    expect(validateDomainName("jan.localhost", dev)).toMatchObject({ error: "platformDomain" });
    expect(validateDomainName("moja-domena.pl.localhost", prod)).toMatchObject({ error: "platformDomain" });
  });
});

describe("domain helpers", () => {
  it("detects apex names and splits extensions", () => {
    expect(isApexDomain("jan.pl")).toBe(true);
    expect(isApexDomain("jan.com.pl")).toBe(true);
    expect(isApexDomain("www.jan.pl")).toBe(false);
    expect(apexOf("www.jan.pl")).toBe("jan.pl");
    expect(splitDomain("jan.com.pl")).toEqual({ name: "jan", extension: "com.pl" });
    expect(splitDomain("jan.pl")).toEqual({ name: "jan", extension: "pl" });
  });
});
