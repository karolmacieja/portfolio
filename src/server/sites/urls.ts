import { getEnv } from "@/lib/env";
import { normalizeHostname } from "@/lib/hosts";

/** Platform hostname of a site, e.g. `jan.example.com` (no port). */
export function siteSubdomainHostname(slug: string): string {
  return `${slug}.${normalizeHostname(getEnv().ROOT_DOMAIN)}`;
}

/** Public URL of a site on its platform subdomain (port kept for local development). */
export function siteSubdomainUrl(slug: string, path = "/"): string {
  const { APP_PROTOCOL, ROOT_DOMAIN } = getEnv();
  return `${APP_PROTOCOL}://${slug}.${ROOT_DOMAIN}${path}`;
}
