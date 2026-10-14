/**
 * Site slugs are used as subdomain labels: {slug}.{ROOT_DOMAIN}.
 */

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;

/** Labels that must never become client subdomains (platform hosts, infrastructure, look-alikes). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "www",
  "app",
  "admin",
  "api",
  "mail",
  "email",
  "smtp",
  "imap",
  "pop",
  "mx",
  "ns",
  "ns1",
  "ns2",
  "dns",
  "ftp",
  "sftp",
  "ssh",
  "vpn",
  "cdn",
  "static",
  "assets",
  "media",
  "img",
  "images",
  "files",
  "storage",
  "uploads",
  "auth",
  "login",
  "logout",
  "register",
  "signup",
  "signin",
  "account",
  "accounts",
  "billing",
  "pay",
  "payment",
  "payments",
  "checkout",
  "invoice",
  "invoices",
  "dashboard",
  "panel",
  "console",
  "status",
  "health",
  "help",
  "support",
  "docs",
  "blog",
  "news",
  "dev",
  "test",
  "staging",
  "stage",
  "preview",
  "demo",
  "sandbox",
  "beta",
  "internal",
  "root",
  "system",
  "webhook",
  "webhooks",
  "security",
  "abuse",
  "legal",
  "terms",
  "privacy",
  "cookies",
  "pricing",
  "about",
  "contact",
  "templates",
  "sites",
  "marketing",
]);

export type SlugError = "tooShort" | "tooLong" | "invalidChars" | "hyphenEdge" | "punycode" | "reserved";

export function validateSlug(slug: string): { ok: true } | { ok: false; error: SlugError } {
  if (slug.length < SLUG_MIN_LENGTH) return { ok: false, error: "tooShort" };
  if (slug.length > SLUG_MAX_LENGTH) return { ok: false, error: "tooLong" };
  if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, error: "invalidChars" };
  if (slug.startsWith("-") || slug.endsWith("-")) return { ok: false, error: "hyphenEdge" };
  // "xn--" style labels are IDN punycode; disallow "--" at positions 3-4 altogether.
  if (slug.slice(2, 4) === "--") return { ok: false, error: "punycode" };
  if (RESERVED_SLUGS.has(slug)) return { ok: false, error: "reserved" };
  return { ok: true };
}

/** Suggests a slug from a site name: transliterates Polish characters, keeps [a-z0-9-]. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replaceAll("ł", "l")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}
