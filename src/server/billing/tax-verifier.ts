import type { Env } from "@/lib/env";

/** EU VAT id verification. `null` = service unavailable (the profile is saved unverified). */
export interface TaxIdVerifier {
  readonly name: string;
  verify(country: string, number: string): Promise<{ valid: boolean } | null>;
}

/** Accepts every id that passed local format/checksum validation. */
export class MockTaxIdVerifier implements TaxIdVerifier {
  readonly name = "mock";
  async verify() {
    return { valid: true };
  }
}

/** EU VIES REST API (public, no key). https://ec.europa.eu/taxation_customs/vies/ */
export class ViesTaxIdVerifier implements TaxIdVerifier {
  readonly name = "vies";
  async verify(country: string, number: string) {
    try {
      const response = await fetch("https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ countryCode: country, vatNumber: number }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { valid?: boolean };
      return typeof body.valid === "boolean" ? { valid: body.valid } : null;
    } catch {
      return null;
    }
  }
}

export function createTaxIdVerifier(env: Env): TaxIdVerifier {
  return env.TAX_ID_PROVIDER === "vies" ? new ViesTaxIdVerifier() : new MockTaxIdVerifier();
}
