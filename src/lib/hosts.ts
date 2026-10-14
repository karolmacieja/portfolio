import { validateSlug } from "./slug";

/**
 * Host-based routing. Every request is classified by its Host header:
 *
 *   {root} | www.{root}   -> marketing site
 *   app.{root}            -> client panel
 *   admin.{root}          -> admin panel
 *   {slug}.{root}         -> published client site
 *   anything else         -> custom domain (looked up in the Domain table)
 *
 * Ports are ignored, so `jan.localhost:3000` matches ROOT_DOMAIN `localhost:3000`.
 */

export type HostTarget =
  | { kind: "marketing" }
  | { kind: "app" }
  | { kind: "admin" }
  | { kind: "site"; hostname: string; slug: string }
  | { kind: "customDomain"; hostname: string }
  | { kind: "invalid" };

const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

/** Lowercases, strips the port and a trailing dot. Returns null for malformed hosts. */
export function normalizeHostname(host: string | null | undefined): string | null {
  if (!host) return null;
  let hostname = host.trim().toLowerCase();
  const portIndex = hostname.lastIndexOf(":");
  if (portIndex !== -1) {
    if (!/^\d{1,5}$/.test(hostname.slice(portIndex + 1))) return null;
    hostname = hostname.slice(0, portIndex);
  }
  if (hostname.endsWith(".")) hostname = hostname.slice(0, -1);
  return HOSTNAME_PATTERN.test(hostname) ? hostname : null;
}

export function classifyHost(host: string | null | undefined, rootDomain: string): HostTarget {
  const hostname = normalizeHostname(host);
  const root = normalizeHostname(rootDomain);
  if (!hostname || !root) return { kind: "invalid" };

  if (hostname === root || hostname === `www.${root}`) return { kind: "marketing" };
  if (hostname === `app.${root}`) return { kind: "app" };
  if (hostname === `admin.${root}`) return { kind: "admin" };

  if (hostname.endsWith(`.${root}`)) {
    const label = hostname.slice(0, -(root.length + 1));
    // Deeper names (a.b.{root}) are not client subdomains; they resolve like custom domains
    // (Domain table / dev-domains.json) and are usually just not found.
    if (label.includes(".")) return { kind: "customDomain", hostname };
    // Reserved or malformed labels are never served.
    if (!validateSlug(label).ok) return { kind: "invalid" };
    return { kind: "site", hostname, slug: label };
  }

  return { kind: "customDomain", hostname };
}
