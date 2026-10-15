import { splitDomain } from "@/lib/domain-name";

import {
  RegistrarError,
  type Availability,
  type DomainRegistrar,
  type Registrant,
  type ZoneRecord,
} from "./registrar-types";

/**
 * Openprovider reseller API (REST v1beta, https://docs.openprovider.com). Responses use the
 * envelope { code, desc, data } (code 0 = success); requests authenticate with a bearer token from
 * /auth/login (valid 48 h, cached here). Purchased domains use Openprovider's name servers and DNS.
 */

type Envelope<T> = { code: number; desc?: string; data: T };
type CheckResult = {
  domain: string;
  status: string;
  is_premium?: boolean;
  price?: { reseller?: { price: number; currency: string }; product?: { price: number; currency: string } };
};

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export class OpenproviderRegistrar implements DomainRegistrar {
  readonly name = "openprovider";
  private token: { value: string; expiresAt: number } | null = null;
  private readonly fetch: typeof fetch;

  constructor(
    private readonly config: { username: string; password: string; apiUrl: string; fetch?: typeof fetch },
  ) {
    this.fetch = config.fetch ?? fetch;
  }

  private async raw<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth) headers.Authorization = `Bearer ${await this.authToken()}`;
    let response: Response;
    try {
      response = await this.fetch(`${this.config.apiUrl.replace(/\/$/, "")}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new RegistrarError(`Openprovider unreachable: ${(error as Error).message}`, true);
    }
    const payload = (await response.json().catch(() => null)) as Envelope<T> | null;
    if (response.status === 401 && auth) this.token = null;
    if (!response.ok || !payload || payload.code !== 0) {
      const message = payload ? `${payload.code}: ${payload.desc ?? ""}` : `HTTP ${response.status}`;
      throw new RegistrarError(
        `Openprovider ${message}`,
        response.status >= 500 || response.status === 429 || response.status === 401,
      );
    }
    return payload.data;
  }

  private async authToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const data = await this.raw<{ token: string }>(
      "POST",
      "/auth/login",
      { username: this.config.username, password: this.config.password },
      false,
    );
    this.token = { value: data.token, expiresAt: Date.now() + TOKEN_TTL_MS };
    return data.token;
  }

  async check(domains: string[]): Promise<Availability[]> {
    const data = await this.raw<{ results: CheckResult[] }>("POST", "/domains/check", {
      domains: domains.map((domain) => splitDomain(domain)),
      with_price: true,
    });
    return domains.map((domain) => {
      const result = data.results.find((r) => r.domain === domain);
      const price = result?.price?.reseller ?? result?.price?.product;
      return {
        domain,
        available: result?.status === "free",
        premium: Boolean(result?.is_premium),
        cost: price
          ? { amount: Math.round(price.price * 100), currency: price.currency.toUpperCase() }
          : null,
      };
    });
  }

  async createContact(registrant: Registrant): Promise<string> {
    const data = await this.raw<{ handle: string }>("POST", "/customers", {
      name: { first_name: registrant.firstName, last_name: registrant.lastName },
      ...(registrant.companyName ? { company_name: registrant.companyName } : {}),
      ...(registrant.taxId ? { vat: registrant.taxId } : {}),
      email: registrant.email,
      phone: {
        country_code: registrant.phone.countryCode,
        area_code: "",
        subscriber_number: registrant.phone.number,
      },
      address: {
        street: registrant.street,
        number: "",
        zipcode: registrant.postalCode,
        city: registrant.city,
        country: registrant.country,
      },
    });
    return data.handle;
  }

  async register(input: { domain: string; handle: string; nameservers: string[]; years: number }) {
    const data = await this.raw<{ id: number; expiration_date?: string }>("POST", "/domains", {
      domain: splitDomain(input.domain),
      period: input.years,
      unit: "y",
      owner_handle: input.handle,
      admin_handle: input.handle,
      tech_handle: input.handle,
      billing_handle: input.handle,
      name_servers: input.nameservers.map((name) => ({ name })),
      // Renewals follow the client's yearly payment, never the registrar's automation.
      autorenew: "off",
    });
    return { registrarDomainId: String(data.id), expiresAt: parseDate(data.expiration_date) };
  }

  async setDnsRecords(domain: string, records: ZoneRecord[]): Promise<void> {
    const zoneRecords = records.map((record) => ({ ...record, ttl: record.ttl ?? 3600 }));
    try {
      await this.raw("POST", "/dns/zones", {
        domain: splitDomain(domain),
        type: "master",
        records: zoneRecords,
      });
    } catch (error) {
      if (!(error instanceof RegistrarError) || !/exist/i.test(error.message)) throw error;
      await this.raw("PUT", `/dns/zones/${encodeURIComponent(domain)}`, { records: { add: zoneRecords } });
    }
  }

  async renew(input: { registrarDomainId: string; domain: string; years: number }) {
    await this.raw("POST", `/domains/${encodeURIComponent(input.registrarDomainId)}/renew`, {
      domain: splitDomain(input.domain),
      period: input.years,
    });
    return { expiresAt: (await this.getInfo(input.registrarDomainId)).expiresAt };
  }

  async getInfo(registrarDomainId: string) {
    const data = await this.raw<{ expiration_date?: string; status?: string }>(
      "GET",
      `/domains/${encodeURIComponent(registrarDomainId)}`,
    );
    return { expiresAt: parseDate(data.expiration_date), status: data.status ?? "unknown" };
  }

  async getAuthCode(registrarDomainId: string): Promise<string> {
    const data = await this.raw<{ auth_code: string }>(
      "GET",
      `/domains/${encodeURIComponent(registrarDomainId)}/authcode`,
    );
    return data.auth_code;
  }
}
