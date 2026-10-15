import { domainToASCII } from "node:url";

import { normalizeHostname } from "./hosts";

/**
 * Validation of hostnames clients connect to their sites. Returns the canonical form (lowercase
 * ASCII/punycode, no trailing dot) or the reason it is refused.
 */

export type DomainNameError =
  "invalid" | "tooLong" | "ipAddress" | "platformDomain" | "missingTld" | "wildcard";

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export function validateDomainName(
  input: string,
  options: { rootDomain: string; allowLocalhost?: boolean },
): { ok: true; hostname: string } | { ok: false; error: DomainNameError } {
  let value = input.trim().toLowerCase();
  // Accept pasted URLs: "https://www.example.pl/path" -> "www.example.pl".
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/?#]/)[0] ?? "";
  value = value.replace(/\.$/, "");
  if (value.includes("*")) return { ok: false, error: "wildcard" };
  if (value.includes(":") || /^\d+(\.\d+){3}$/.test(value)) return { ok: false, error: "ipAddress" };

  const ascii = domainToASCII(value);
  if (!ascii) return { ok: false, error: "invalid" };
  if (ascii.length > 253) return { ok: false, error: "tooLong" };
  const labels = ascii.split(".");
  if (labels.length < 2) return { ok: false, error: "missingTld" };
  if (!labels.every((label) => LABEL.test(label))) return { ok: false, error: "invalid" };

  const tld = labels.at(-1)!;
  const localhost = tld === "localhost";
  if (
    localhost ? !options.allowLocalhost || labels.length < 3 : !/^(xn--[a-z0-9-]+|[a-z]{2,63})$/.test(tld)
  ) {
    return { ok: false, error: localhost ? "platformDomain" : "missingTld" };
  }

  // The platform's own domain and its subdomains are never client domains.
  const root = normalizeHostname(options.rootDomain);
  if (root && root !== "localhost" && (ascii === root || ascii.endsWith(`.${root}`))) {
    return { ok: false, error: "platformDomain" };
  }
  // Locally (ROOT_DOMAIN=localhost) single-label *.localhost hosts are platform subdomains.
  if (localhost && labels.length === 2) return { ok: false, error: "platformDomain" };

  return { ok: true, hostname: ascii };
}

/** "www.example.pl" -> "example.pl"; apex names stay as they are. */
export function apexOf(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

/**
 * Whether the hostname is a registrable apex (needs flattening/A records) rather than a subdomain.
 * Approximation without the public suffix list: two labels, or three for known Polish second-level
 * domains (com.pl, art.pl, ...).
 */
const MULTI_LABEL_SUFFIXES = new Set([
  "com.pl",
  "net.pl",
  "org.pl",
  "info.pl",
  "biz.pl",
  "art.pl",
  "edu.pl",
  "waw.pl",
  "co.uk",
  "org.uk",
  "com.de",
]);
export function isApexDomain(hostname: string): boolean {
  const labels = hostname.split(".");
  if (labels.length === 2) return true;
  return labels.length === 3 && MULTI_LABEL_SUFFIXES.has(labels.slice(1).join("."));
}

/** Splits "jan.com.pl" into name "jan" and extension "com.pl" (for registrars). */
export function splitDomain(domain: string): { name: string; extension: string } {
  const labels = domain.split(".");
  const twoLevel = labels.length >= 3 && MULTI_LABEL_SUFFIXES.has(labels.slice(-2).join("."));
  const extensionLabels = twoLevel ? 2 : 1;
  return {
    name: labels.slice(0, -extensionLabels).join("."),
    extension: labels.slice(-extensionLabels).join("."),
  };
}
