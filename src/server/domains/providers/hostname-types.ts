/**
 * Custom hostname adapter (Cloudflare for SaaS in production, mock for development/tests): registers
 * client hostnames on our zone, issues their certificates and reports verification state.
 */

export type DnsRecord = {
  type: "CNAME" | "TXT" | "A";
  name: string;
  value: string;
  /** routing: points traffic at us; ownership/ssl: verification (optional when routing is in place). */
  purpose: "routing" | "ownership" | "ssl";
};

export type HostnameState = {
  providerId: string;
  status: "PENDING_DNS" | "PENDING_SSL" | "ACTIVE" | "ERROR";
  sslStatus: string | null;
  /** Verification records from the provider (routing records are added by the domain service). */
  records: DnsRecord[];
  error: string | null;
};

export interface HostnameProvider {
  readonly name: string;
  create(hostname: string): Promise<HostnameState>;
  get(providerId: string): Promise<HostnameState>;
  /** Asks the provider to validate again (after the client fixed DNS). */
  refresh(providerId: string): Promise<HostnameState>;
  delete(providerId: string): Promise<void>;
}

export class HostnameProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "HostnameProviderError";
  }
}
