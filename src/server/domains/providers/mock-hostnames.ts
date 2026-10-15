import { createHash } from "node:crypto";

import { HostnameProviderError, type HostnameProvider, type HostnameState } from "./hostname-types";

/**
 * Mock custom hostnames: a new hostname waits for DNS; the first status check marks it active
 * (simulating a client who set the CNAME). Hostnames containing "fail" end in ERROR, to exercise it.
 */
const MOCK_PREFIX = "mock_ch_";

function state(hostname: string, status: HostnameState["status"]): HostnameState {
  const token = createHash("sha256").update(hostname).digest("hex").slice(0, 32);
  return {
    providerId: `${MOCK_PREFIX}${hostname}`,
    status,
    sslStatus:
      status === "ACTIVE" ? "active" : status === "ERROR" ? "validation_timed_out" : "pending_validation",
    records: [{ type: "TXT", name: `_cf-custom-hostname.${hostname}`, value: token, purpose: "ownership" }],
    error: status === "ERROR" ? "Mock: DNS records not found" : null,
  };
}

function hostnameOf(providerId: string): string {
  if (!providerId.startsWith(MOCK_PREFIX)) throw new HostnameProviderError("Mock: unknown hostname", false);
  return providerId.slice(MOCK_PREFIX.length);
}

export class MockHostnameProvider implements HostnameProvider {
  readonly name = "mock";

  async create(hostname: string) {
    return state(hostname, "PENDING_DNS");
  }

  async get(providerId: string) {
    const hostname = hostnameOf(providerId);
    return state(hostname, hostname.includes("fail") ? "ERROR" : "ACTIVE");
  }

  async refresh(providerId: string) {
    return this.get(providerId);
  }

  async delete(providerId: string) {
    hostnameOf(providerId);
  }
}
