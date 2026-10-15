import { describe, expect, it, vi } from "vitest";

import { createSignedToken, verifySignedToken } from "./signed-token";

const SECRET = "x".repeat(32);

describe("signed tokens", () => {
  it("round-trips the payload", () => {
    const token = createSignedToken({ a: 1 }, SECRET, "test", 60);
    expect(verifySignedToken<{ a: number }>(token, SECRET, "test")).toMatchObject({ a: 1 });
  });

  it("rejects tampering, another purpose, another secret and expiry", () => {
    const token = createSignedToken({ amount: 100 }, SECRET, "test", 60);
    const [data, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ amount: 1, exp: 9_999_999_999 })).toString("base64url");
    expect(verifySignedToken(`${forged}.${sig}`, SECRET, "test")).toBeNull();
    expect(verifySignedToken(`${data}.${sig}`, SECRET, "other")).toBeNull();
    expect(verifySignedToken(token, "y".repeat(32), "test")).toBeNull();
    expect(verifySignedToken("garbage", SECRET, "test")).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    expect(verifySignedToken(token, SECRET, "test")).toBeNull();
    vi.useRealTimers();
  });
});
