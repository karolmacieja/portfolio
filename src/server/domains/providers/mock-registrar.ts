import { randomBytes } from "node:crypto";

import { splitDomain } from "@/lib/domain-name";

import { RegistrarError, type DomainRegistrar } from "./registrar-types";

/**
 * Mock registrar: names containing "zajeta"/"taken" are unavailable, "premium" ones are premium (not
 * offered); costs are fixed per extension (PLN). Registration always succeeds for a year.
 */
const COST_PLN: Record<string, number> = {
  pl: 3500,
  com: 5500,
  "com.pl": 2500,
  "art.pl": 2000,
  "info.pl": 2000,
};

const inOneYear = (from = new Date()) => new Date(from.getTime() + 365 * 24 * 60 * 60 * 1000);

export class MockRegistrar implements DomainRegistrar {
  readonly name = "mock";

  async check(domains: string[]) {
    return domains.map((domain) => {
      const { name, extension } = splitDomain(domain);
      return {
        domain,
        available: !/zajeta|taken/.test(name),
        premium: name.includes("premium"),
        cost: { amount: COST_PLN[extension] ?? 6000, currency: "PLN" },
      };
    });
  }

  async createContact() {
    return `MOCK${randomBytes(4).toString("hex").toUpperCase()}`;
  }

  async register(input: { domain: string }) {
    if (input.domain.includes("odrzucona"))
      throw new RegistrarError("Mock: registry rejected the registration", false);
    return { registrarDomainId: `mock_dom_${input.domain}`, expiresAt: inOneYear() };
  }

  async setDnsRecords() {}

  /** The caller passes the current expiry; a renewal adds a year to it. */
  async renew(input: { currentExpiresAt?: Date | null }) {
    return { expiresAt: inOneYear(input.currentExpiresAt ?? new Date()) };
  }

  async getInfo() {
    return { expiresAt: null, status: "ACT" };
  }

  async getAuthCode() {
    return randomBytes(8).toString("base64url");
  }
}
