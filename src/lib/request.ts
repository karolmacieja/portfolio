/**
 * Client IP for rate limiting (never for authorization).
 *
 * Each reverse proxy appends the address it received the request from to X-Forwarded-For,
 * so only the last `trustedProxyHops` entries are trustworthy; anything to the left can be
 * forged by the client. With one proxy (Caddy/Traefik) the last entry is the real client IP.
 */
export function getClientIp(headers: Headers, trustedProxyHops = getTrustedProxyHops()): string {
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (forwarded?.length && trustedProxyHops > 0) {
    return forwarded[Math.max(0, forwarded.length - trustedProxyHops)]!;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

function getTrustedProxyHops(): number {
  const value = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
  return Number.isInteger(value) && value >= 0 ? value : 1;
}

const HOST_PATTERN = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/**
 * Public origin of the request, taken from the Host / X-Forwarded-Host headers.
 * Next.js builds `request.url` from its own listen address, which is wrong for a
 * multi-host app (app./admin./client domains). Returns null for malformed hosts.
 */
export function getRequestOrigin(headers: Headers, fallbackProtocol: "http" | "https"): string | null {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host"))?.split(",")[0]?.trim();
  if (!host || !HOST_PATTERN.test(host)) return null;
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol =
    forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : fallbackProtocol;
  return `${protocol}://${host.toLowerCase()}`;
}
