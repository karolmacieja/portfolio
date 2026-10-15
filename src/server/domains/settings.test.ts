import { describe, expect, it } from "vitest";

import { routingRecords } from "./dns";
import { customerPrice, domainSettingsSchema } from "./settings";

const settings = domainSettingsSchema.parse({});

describe("customerPrice", () => {
  it("applies the percentage markup or the minimum, VAT and rounds up to whole złoty", () => {
    // 35 zł cost: 30% = 10.50 < 20 zł minimum -> 55 zł net -> 67.65 gross -> 68 zł.
    expect(customerPrice({ amount: 3500, currency: "PLN" }, settings, "23")).toBe(6800);
    // 200 zł cost: 30% = 60 zł > minimum -> 260 net -> 319.80 gross -> 320 zł.
    expect(customerPrice({ amount: 20000, currency: "PLN" }, settings, "23")).toBe(32000);
    // 9.50 EUR * 4.3 = 40.85 zł + 20 zł minimum -> 60.85 net -> 74.85 gross -> 75 zł.
    expect(customerPrice({ amount: 950, currency: "EUR" }, settings, "23")).toBe(7500);
    expect(customerPrice({ amount: 3500, currency: "PLN" }, settings, "zw")).toBe(5500);
    expect(customerPrice({ amount: 100, currency: "GBP" }, settings, "23")).toBeNull();
  });
});

describe("routingRecords", () => {
  const env = {
    CUSTOM_DOMAIN_CNAME_TARGET: undefined,
    ROOT_DOMAIN: "example.com",
    CUSTOM_DOMAIN_APEX_IPS: [] as string[],
  };
  it("points subdomains via CNAME and apex names via A records when configured", () => {
    expect(routingRecords("www.jan.pl", env)).toEqual([
      { type: "CNAME", name: "www.jan.pl", value: "sites.example.com", purpose: "routing" },
    ]);
    expect(routingRecords("jan.pl", { ...env, CUSTOM_DOMAIN_APEX_IPS: ["192.0.2.1"] })).toEqual([
      { type: "A", name: "jan.pl", value: "192.0.2.1", purpose: "routing" },
    ]);
    expect(routingRecords("jan.pl", env)[0]).toMatchObject({ type: "CNAME", value: "sites.example.com" });
  });
});
