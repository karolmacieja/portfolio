import { describe, expect, it } from "vitest";

import { registerSchema, signInSchema } from "./schemas";

const valid = { name: "Jan Kowalski", email: "  Jan@Example.COM ", password: "abcdefgh12", terms: "on" };

describe("registerSchema", () => {
  it("normalizes email to trimmed lowercase", () => {
    expect(registerSchema.parse(valid).email).toBe("jan@example.com");
  });

  it.each([
    ["short", "abc12", "passwordRules.tooShort"],
    ["no digit", "abcdefghijk", "passwordRules.needsDigit"],
    ["no letter", "12345678901", "passwordRules.needsLetter"],
  ])("rejects a password with %s", (_, password, message) => {
    const result = registerSchema.safeParse({ ...valid, password });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain(message);
  });

  it("rejects a filled honeypot", () => {
    expect(registerSchema.safeParse({ ...valid, website: "spam.example" }).success).toBe(false);
  });

  it("requires accepting the terms", () => {
    const { terms: _terms, ...withoutTerms } = valid;
    expect(registerSchema.safeParse(withoutTerms).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(registerSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("requires a password", () => {
    expect(signInSchema.safeParse({ email: "a@b.pl", password: "" }).success).toBe(false);
  });
});
