/**
 * Tax identifiers for billing profiles.
 *   NIP: Polish tax id, 10 digits with a mod-11 checksum.
 *   EU VAT id: country prefix + national number (format check only; VIES verifies existence).
 */

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

/** Strips separators and an optional "PL" prefix: "PL 123-456-32-18" -> "1234563218". */
export function normalizeNip(input: string): string {
  return input.toUpperCase().replace(/^PL/, "").replace(/[\s-]/g, "");
}

export function isValidNip(input: string): boolean {
  const nip = normalizeNip(input);
  if (!/^\d{10}$/.test(nip)) return false;
  const digits = [...nip].map(Number);
  const sum = NIP_WEIGHTS.reduce((acc, weight, i) => acc + weight * digits[i]!, 0);
  const checksum = sum % 11;
  return checksum !== 10 && checksum === digits[9];
}

/** EU member states (VIES country codes; Greece is "EL"). */
export const EU_VAT_COUNTRIES = [
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "EL",
  "ES",
  "FI",
  "FR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
] as const;

export function normalizeEuVatId(input: string): string {
  return input.toUpperCase().replace(/[\s.-]/g, "");
}

/** Splits "DE123456789" into country and number when the format is plausible. */
export function parseEuVatId(input: string): { country: string; number: string } | null {
  const vat = normalizeEuVatId(input);
  const match = vat.match(/^([A-Z]{2})([0-9A-Z+*]{2,12})$/);
  if (!match || !(EU_VAT_COUNTRIES as readonly string[]).includes(match[1]!)) return null;
  if (match[1] === "PL" && !isValidNip(match[2]!)) return null;
  return { country: match[1]!, number: match[2]! };
}
