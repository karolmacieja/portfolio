import { isApexDomain } from "@/lib/domain-name";
import type { Env } from "@/lib/env";
import { normalizeHostname } from "@/lib/hosts";

import type { DnsRecord } from "./providers";

/** Target of client CNAME records (the Cloudflare for SaaS fallback origin hostname). */
export function cnameTarget(env: Pick<Env, "CUSTOM_DOMAIN_CNAME_TARGET" | "ROOT_DOMAIN">): string {
  return env.CUSTOM_DOMAIN_CNAME_TARGET || `sites.${normalizeHostname(env.ROOT_DOMAIN)}`;
}

/**
 * Records that route a hostname to us: CNAME for subdomains (www.*), and for apex names either A
 * records (when apex IPs are configured) or a CNAME at the apex, which needs CNAME flattening/ALIAS
 * support at the client's DNS provider.
 */
export function routingRecords(
  hostname: string,
  env: Pick<Env, "CUSTOM_DOMAIN_CNAME_TARGET" | "ROOT_DOMAIN" | "CUSTOM_DOMAIN_APEX_IPS">,
): DnsRecord[] {
  if (isApexDomain(hostname) && env.CUSTOM_DOMAIN_APEX_IPS.length > 0) {
    return env.CUSTOM_DOMAIN_APEX_IPS.map((ip) => ({
      type: "A",
      name: hostname,
      value: ip,
      purpose: "routing",
    }));
  }
  return [{ type: "CNAME", name: hostname, value: cnameTarget(env), purpose: "routing" }];
}
