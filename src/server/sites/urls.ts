import { getEnv } from "@/lib/env";
import { normalizeHostname } from "@/lib/hosts";

/** Platform hostname of a site, e.g. `jan.example.com` (no port). */
export function siteSubdomainHostname(slug: string): string {
  return `${slug}.${normalizeHostname(getEnv().ROOT_DOMAIN)}`;
}

/** Public URL on a custom domain (the platform's port is kept for local development). */
export function customDomainUrl(hostname: string, path = "/"): string {
  const { APP_PROTOCOL, ROOT_DOMAIN } = getEnv();
  const port = /:\d+$/.exec(ROOT_DOMAIN)?.[0] ?? "";
  return `${APP_PROTOCOL}://${hostname}${port}${path}`;
}

/** Public URL of a site on its platform subdomain (port kept for local development). */
export function siteSubdomainUrl(slug: string, path = "/"): string {
  const { APP_PROTOCOL, ROOT_DOMAIN } = getEnv();
  return `${APP_PROTOCOL}://${slug}.${ROOT_DOMAIN}${path}`;
}
