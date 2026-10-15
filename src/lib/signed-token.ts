import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Compact signed tokens (`base64url(json).base64url(hmac)`) for short-lived internal payloads:
 * mock checkout sessions and worker -> app cache invalidation. Not encrypted: never put secrets in.
 */

function sign(data: string, secret: string, purpose: string): string {
  return createHmac("sha256", `${purpose}:${secret}`).update(data).digest("base64url");
}

export function createSignedToken(
  payload: object,
  secret: string,
  purpose: string,
  ttlSeconds: number,
): string {
  const data = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString("base64url");
  return `${data}.${sign(data, secret, purpose)}`;
}

/** Returns the payload when the signature (for this purpose) is valid and the token not expired. */
export function verifySignedToken<T>(token: string, secret: string, purpose: string): T | null {
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;
  const expected = Buffer.from(sign(data, secret, purpose));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as T & { exp: number };
    return payload.exp * 1000 > Date.now() ? payload : null;
  } catch {
    return null;
  }
}
