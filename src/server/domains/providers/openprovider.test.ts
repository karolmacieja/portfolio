import { describe, expect, it } from "vitest";

import { OpenproviderRegistrar } from "./openprovider";

function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const calls: { url: string; method: string; body: unknown; auth: string | null }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
      auth: new Headers(init?.headers).get("Authorization"),
    });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const login = { body: { code: 0, data: { token: "tkn", reseller_id: 1 } } };
const config = { username: "u", password: "p", apiUrl: "https://api.openprovider.eu/v1beta" };

describe("OpenproviderRegistrar", () => {
  it("logs in once and checks availability with reseller prices", async () => {
    const { calls, fetchImpl } = fakeFetch([
      login,
      {
        body: {
          code: 0,
          data: {
            results: [
              { domain: "jan.pl", status: "free", price: { reseller: { price: 9.5, currency: "EUR" } } },
              { domain: "jan.com.pl", status: "active" },
            ],
          },
        },
      },
      { body: { code: 0, data: { results: [] } } },
    ]);
    const registrar = new OpenproviderRegistrar({ ...config, fetch: fetchImpl });
    expect(await registrar.check(["jan.pl", "jan.com.pl"])).toEqual([
      { domain: "jan.pl", available: true, premium: false, cost: { amount: 950, currency: "EUR" } },
      { domain: "jan.com.pl", available: false, premium: false, cost: null },
    ]);
    await registrar.check(["x.pl"]);
    expect(calls.map((c) => c.url.replace(config.apiUrl, ""))).toEqual([
      "/auth/login",
      "/domains/check",
      "/domains/check",
    ]);
    expect(calls[1]).toMatchObject({
      auth: "Bearer tkn",
      body: {
        domains: [
          { name: "jan", extension: "pl" },
          { name: "jan", extension: "com.pl" },
        ],
        with_price: true,
      },
    });
  });

  it("creates the contact, registers with our name servers and autorenew off", async () => {
    const { calls, fetchImpl } = fakeFetch([
      login,
      { body: { code: 0, data: { handle: "JK000001-PL" } } },
      { body: { code: 0, data: { id: 123, status: "ACT", expiration_date: "2027-10-15 10:00:00" } } },
    ]);
    const registrar = new OpenproviderRegistrar({ ...config, fetch: fetchImpl });
    const handle = await registrar.createContact({
      type: "PERSON",
      firstName: "Jan",
      lastName: "Kowalski",
      companyName: null,
      taxId: null,
      email: "jan@example.com",
      phone: { countryCode: "+48", number: "600100200" },
      street: "Polna 1",
      postalCode: "00-001",
      city: "Warszawa",
      country: "PL",
    });
    expect(handle).toBe("JK000001-PL");
    expect(calls[1]!.body).toMatchObject({
      name: { first_name: "Jan", last_name: "Kowalski" },
      phone: { country_code: "+48", subscriber_number: "600100200" },
      address: { zipcode: "00-001", country: "PL" },
    });

    const registered = await registrar.register({
      domain: "jan.pl",
      handle,
      nameservers: ["ns1.example"],
      years: 1,
    });
    expect(registered).toEqual({ registrarDomainId: "123", expiresAt: new Date("2027-10-15T10:00:00Z") });
    expect(calls[2]!.body).toMatchObject({
      domain: { name: "jan", extension: "pl" },
      period: 1,
      owner_handle: "JK000001-PL",
      name_servers: [{ name: "ns1.example" }],
      autorenew: "off",
    });
  });

  it("adds records to an existing zone and maps API errors", async () => {
    const { calls, fetchImpl } = fakeFetch([
      login,
      { status: 400, body: { code: 817, desc: "Zone already exists" } },
      { body: { code: 0, data: { success: true } } },
      { status: 500, body: { code: 1, desc: "Internal error" } },
    ]);
    const registrar = new OpenproviderRegistrar({ ...config, fetch: fetchImpl });
    await registrar.setDnsRecords("jan.pl", [{ type: "CNAME", name: "www", value: "sites.example.com" }]);
    expect(calls[2]).toMatchObject({
      method: "PUT",
      url: `${config.apiUrl}/dns/zones/jan.pl`,
      body: { records: { add: [{ type: "CNAME", name: "www", value: "sites.example.com", ttl: 3600 }] } },
    });
    await expect(registrar.getAuthCode("123")).rejects.toMatchObject({ retryable: true });
  });
});
