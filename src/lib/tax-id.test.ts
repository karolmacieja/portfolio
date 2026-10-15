import { describe, expect, it } from "vitest";

import { isValidNip, normalizeNip, parseEuVatId } from "./tax-id";

describe("NIP", () => {
  it.each(["1234563218", "123-456-32-18", "PL 123 456 32 18", "5260250274"])("accepts %s", (nip) => {
    expect(isValidNip(nip)).toBe(true);
  });

  it.each(["1234563219", "123456321", "abcdefghij", "", "0000000001"])("rejects %j", (nip) => {
    expect(isValidNip(nip)).toBe(false);
  });

  it("normalizes separators and the PL prefix", () => {
    expect(normalizeNip("pl 123-456-32-18")).toBe("1234563218");
  });
});

describe("EU VAT id", () => {
  it("parses plausible ids of EU countries", () => {
    expect(parseEuVatId("de 123 456 789")).toEqual({ country: "DE", number: "123456789" });
    expect(parseEuVatId("PL1234563218")).toEqual({ country: "PL", number: "1234563218" });
  });

  it.each(["US123456789", "DE", "PL1234563219", "XX123"])("rejects %j", (vat) => {
    expect(parseEuVatId(vat)).toBeNull();
  });
});
