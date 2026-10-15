import {
  HostnameProviderError,
  type DnsRecord,
  type HostnameProvider,
  type HostnameState,
} from "./hostname-types";

/**
 * Cloudflare for SaaS custom hostnames (API v4, /zones/{zone}/custom_hostnames). Certificates use HTTP
 * validation, so a client only needs the CNAME to our target; the TXT ownership record is an optional
 * pre-validation (e.g. to move a live domain without downtime).
 */

type CfValidationRecord = { txt_name?: string; txt_value?: string; status?: string };
type CfHostname = {
  id: string;
  hostname: string;
  status: string;
  ssl?: {
    status?: string;
    validation_records?: CfValidationRecord[];
    validation_errors?: { message: string }[];
  };
  ownership_verification?: { type?: string; name?: string; value?: string };
  verification_errors?: string[];
};
type CfEnvelope<T> = { success: boolean; errors?: { code: number; message: string }[]; result: T };

const FAILED_HOSTNAME = new Set([
  "blocked",
  "moved",
  "deleted",
  "pending_deletion",
  "test_failed",
  "test_blocked",
]);
const FAILED_SSL = /timed_out|expired|deleted|inactive/;

export function mapCloudflareHostname(hostname: CfHostname): HostnameState {
  const ssl = hostname.ssl?.status ?? null;
  const errors = [
    ...(hostname.verification_errors ?? []),
    ...(hostname.ssl?.validation_errors ?? []).map((e) => e.message),
  ];
  const records: DnsRecord[] = [];
  const ownership = hostname.ownership_verification;
  if (ownership?.name && ownership.value) {
    records.push({ type: "TXT", name: ownership.name, value: ownership.value, purpose: "ownership" });
  }
  for (const record of hostname.ssl?.validation_records ?? []) {
    if (record.txt_name && record.txt_value) {
      records.push({ type: "TXT", name: record.txt_name, value: record.txt_value, purpose: "ssl" });
    }
  }

  let status: HostnameState["status"];
  if (FAILED_HOSTNAME.has(hostname.status) || (ssl && FAILED_SSL.test(ssl))) status = "ERROR";
  else if (hostname.status === "active" && ssl === "active") status = "ACTIVE";
  else if (hostname.status === "active") status = "PENDING_SSL";
  else status = "PENDING_DNS";

  return {
    providerId: hostname.id,
    status,
    sslStatus: ssl,
    records,
    error:
      status === "ERROR"
        ? errors.join("; ") || `${hostname.status}/${ssl ?? "-"}`
        : errors.join("; ") || null,
  };
}

export class CloudflareHostnameProvider implements HostnameProvider {
  readonly name = "cloudflare";
  private readonly fetch: typeof fetch;

  constructor(
    private readonly config: { apiToken: string; zoneId: string; fetch?: typeof fetch; baseUrl?: string },
  ) {
    this.fetch = config.fetch ?? fetch;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.baseUrl ?? "https://api.cloudflare.com/client/v4"}/zones/${this.config.zoneId}/custom_hostnames${path}`;
    let response: Response;
    try {
      response = await this.fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.config.apiToken}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new HostnameProviderError(`Cloudflare unreachable: ${(error as Error).message}`, true);
    }
    const payload = (await response.json().catch(() => null)) as CfEnvelope<T> | null;
    if (!response.ok || !payload?.success) {
      const message =
        payload?.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") || `HTTP ${response.status}`;
      throw new HostnameProviderError(
        `Cloudflare ${message}`,
        response.status >= 500 || response.status === 429,
      );
    }
    return payload.result;
  }

  async create(hostname: string): Promise<HostnameState> {
    try {
      const created = await this.call<CfHostname>("POST", "", {
        hostname,
        ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } },
      });
      return mapCloudflareHostname(created);
    } catch (error) {
      // Already on our zone (e.g. a previous attempt timed out after creating it): adopt it.
      if (error instanceof HostnameProviderError && /duplicate|already exists|1406/i.test(error.message)) {
        const existing = await this.call<CfHostname[]>("GET", `?hostname=${encodeURIComponent(hostname)}`);
        const match = existing.find((item) => item.hostname === hostname);
        if (match) return mapCloudflareHostname(match);
      }
      throw error;
    }
  }

  async get(providerId: string): Promise<HostnameState> {
    return mapCloudflareHostname(await this.call<CfHostname>("GET", `/${encodeURIComponent(providerId)}`));
  }

  async refresh(providerId: string): Promise<HostnameState> {
    // Re-sending the SSL settings restarts validation.
    const updated = await this.call<CfHostname>("PATCH", `/${encodeURIComponent(providerId)}`, {
      ssl: { method: "http", type: "dv" },
    });
    return mapCloudflareHostname(updated);
  }

  async delete(providerId: string): Promise<void> {
    try {
      await this.call("DELETE", `/${encodeURIComponent(providerId)}`);
    } catch (error) {
      // Already gone: deleting is idempotent for us.
      if (error instanceof HostnameProviderError && /not found|1436|1404/i.test(error.message)) return;
      throw error;
    }
  }
}
