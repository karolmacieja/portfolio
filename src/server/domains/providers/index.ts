import type { Env } from "@/lib/env";

import { CloudflareHostnameProvider } from "./cloudflare";
import type { HostnameProvider } from "./hostname-types";
import { MockHostnameProvider } from "./mock-hostnames";
import { MockRegistrar } from "./mock-registrar";
import { OpenproviderRegistrar } from "./openprovider";
import type { DomainRegistrar } from "./registrar-types";

export * from "./hostname-types";
export * from "./registrar-types";

export function createHostnameProvider(env: Env): HostnameProvider {
  if (env.HOSTNAME_PROVIDER === "cloudflare") {
    return new CloudflareHostnameProvider({
      apiToken: env.CLOUDFLARE_API_TOKEN!,
      zoneId: env.CLOUDFLARE_ZONE_ID!,
    });
  }
  return new MockHostnameProvider();
}

export function createRegistrar(env: Env): DomainRegistrar {
  if (env.REGISTRAR_PROVIDER === "openprovider") {
    return new OpenproviderRegistrar({
      username: env.OPENPROVIDER_USERNAME!,
      password: env.OPENPROVIDER_PASSWORD!,
      apiUrl: env.OPENPROVIDER_API_URL,
    });
  }
  return new MockRegistrar();
}

const globalForDomains = globalThis as unknown as {
  hostnames?: HostnameProvider;
  registrar?: DomainRegistrar;
};

/** Process-wide instances (the Openprovider client caches its session token). */
export function getHostnameProvider(env: Env): HostnameProvider {
  globalForDomains.hostnames ??= createHostnameProvider(env);
  return globalForDomains.hostnames;
}

export function getRegistrar(env: Env): DomainRegistrar {
  globalForDomains.registrar ??= createRegistrar(env);
  return globalForDomains.registrar;
}
