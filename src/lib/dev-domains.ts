import devDomainsFile from "../../config/dev-domains.json";

import { normalizeHostname } from "./hosts";

/** Custom domain -> site slug overrides from `config/dev-domains.json` (never used in production). */
export function getDevDomainSlug(hostname: string, appEnv: string): string | null {
  if (appEnv === "production") return null;
  const domains: Record<string, string> = devDomainsFile.domains;
  for (const [host, slug] of Object.entries(domains)) {
    if (normalizeHostname(host) === hostname) return slug;
  }
  return null;
}
