/**
 * Domain registrar adapter (Openprovider in production, mock for development/tests): availability and
 * cost, registrant contacts, registration, DNS zone of purchased domains, renewals and transfer codes.
 */

export type Registrant = {
  type: "PERSON" | "COMPANY";
  firstName: string;
  lastName: string;
  companyName: string | null;
  /** Polish NIP or EU VAT id for companies. */
  taxId: string | null;
  email: string;
  /** Phone split as registries expect it: { countryCode: "+48", number: "600100200" }. */
  phone: { countryCode: string; number: string };
  street: string;
  postalCode: string;
  city: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
};

export type Money = { amount: number; currency: string };

export type Availability = {
  domain: string;
  available: boolean;
  premium: boolean;
  /** Registrar's yearly registration cost (minor units), null when not offered. */
  cost: Money | null;
};

export type ZoneRecord = { type: "A" | "CNAME" | "TXT"; name: string; value: string; ttl?: number };

export interface DomainRegistrar {
  readonly name: string;
  check(domains: string[]): Promise<Availability[]>;
  /** Creates the registrant contact; returns its handle. */
  createContact(registrant: Registrant): Promise<string>;
  register(input: { domain: string; handle: string; nameservers: string[]; years: number }): Promise<{
    registrarDomainId: string;
    expiresAt: Date | null;
  }>;
  /** Creates (or extends) the DNS zone of a purchased domain hosted at the registrar. */
  setDnsRecords(domain: string, records: ZoneRecord[]): Promise<void>;
  renew(input: {
    registrarDomainId: string;
    domain: string;
    years: number;
    currentExpiresAt?: Date | null;
  }): Promise<{ expiresAt: Date | null }>;
  getInfo(registrarDomainId: string): Promise<{ expiresAt: Date | null; status: string }>;
  getAuthCode(registrarDomainId: string): Promise<string>;
}

export class RegistrarError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "RegistrarError";
  }
}
