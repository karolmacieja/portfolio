import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("hashes with argon2id and verifies the original password", async () => {
    const hash = await hashPassword("correct horse 42");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "correct horse 42")).toBe(true);
    expect(await verifyPassword(hash, "wrong password 42")).toBe(false);
  });

  it("produces a different hash for the same password (salted)", async () => {
    expect(await hashPassword("same-password-1")).not.toBe(await hashPassword("same-password-1"));
  });

  it("returns false for a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
  });
});
