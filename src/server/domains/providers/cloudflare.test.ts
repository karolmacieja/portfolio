import { describe, expect, it } from "vitest";

import { CloudflareHostnameProvider, mapCloudflareHostname } from "./cloudflare";

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

const pending = {
  id: "ch_1",
  hostname: "www.jan.pl",
  status: "pending",
  ssl: {
    status: "pending_validation",
    validation_records: [{ txt_name: "_acme-challenge.www.jan.pl", txt_value: "abc" }],
  },
  ownership_verification: { type: "txt", name: "_cf-custom-hostname.www.jan.pl", value: "uuid-1" },
};

describe("mapCloudflareHostname", () => {
  it("maps hostname and certificate states onto domain statuses", () => {
    expect(mapCloudflareHostname(pending)).toEqual({
      providerId: "ch_1",
      status: "PENDING_DNS",
      sslStatus: "pending_validation",
      records: [
        { type: "TXT", name: "_cf-custom-hostname.www.jan.pl", value: "uuid-1", purpose: "ownership" },
        { type: "TXT", name: "_acme-challenge.www.jan.pl", value: "abc", purpose: "ssl" },
      ],
      error: null,
    });
    expect(
      mapCloudflareHostname({ ...pending, status: "active", ssl: { status: "pending_issuance" } }).status,
    ).toBe("PENDING_SSL");
    expect(mapCloudflareHostname({ ...pending, status: "active", ssl: { status: "active" } }).status).toBe(
      "ACTIVE",
    );
    expect(
      mapCloudflareHostname({
        ...pending,
        status: "blocked",
        verification_errors: ["custom hostname does not CNAME to this zone."],
      }),
    ).toMatchObject({ status: "ERROR", error: "custom hostname does not CNAME to this zone." });
    expect(mapCloudflareHostname({ ...pending, ssl: { status: "validation_timed_out" } }).status).toBe(
      "ERROR",
    );
  });
});

describe("CloudflareHostnameProvider", () => {
  it("creates hostnames with HTTP validation using the zone API", async () => {
    const { calls, fetchImpl } = fakeFetch([{ body: { success: true, result: pending } }]);
    const provider = new CloudflareHostnameProvider({ apiToken: "tok", zoneId: "z1", fetch: fetchImpl });
    expect((await provider.create("www.jan.pl")).providerId).toBe("ch_1");
    expect(calls[0]).toEqual({
      url: "https://api.cloudflare.com/client/v4/zones/z1/custom_hostnames",
      method: "POST",
      body: {
        hostname: "www.jan.pl",
        ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } },
      },
      auth: "Bearer tok",
    });
  });

  it("adopts an existing hostname after a duplicate error", async () => {
    const { calls, fetchImpl } = fakeFetch([
      {
        status: 409,
        body: { success: false, errors: [{ code: 1406, message: "Duplicate custom hostname found." }] },
      },
      { body: { success: true, result: [pending] } },
    ]);
    const provider = new CloudflareHostnameProvider({ apiToken: "tok", zoneId: "z1", fetch: fetchImpl });
    expect((await provider.create("www.jan.pl")).providerId).toBe("ch_1");
    expect(calls[1]!.url).toContain("custom_hostnames?hostname=www.jan.pl");
  });

  it("classifies errors and treats deleting a missing hostname as done", async () => {
    const { fetchImpl } = fakeFetch([
      { status: 503, body: { success: false, errors: [{ code: 10000, message: "Internal" }] } },
      {
        status: 404,
        body: { success: false, errors: [{ code: 1436, message: "Custom hostname not found." }] },
      },
    ]);
    const provider = new CloudflareHostnameProvider({ apiToken: "tok", zoneId: "z1", fetch: fetchImpl });
    await expect(provider.get("ch_1")).rejects.toMatchObject({ retryable: true });
    await expect(provider.delete("ch_1")).resolves.toBeUndefined();
  });
});
