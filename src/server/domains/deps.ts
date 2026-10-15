import "server-only";

import { getEnv, platformUrl } from "@/lib/env";
import { getMailer } from "@/server/mail";
import { invalidateTags } from "@/server/sites/invalidate";

import { getHostnameProvider } from "./providers";
import type { DomainDeps } from "./status";

/** Domain side effects inside Next.js (revalidateTag, the process-wide provider instances). */
export function nextDomainDeps(): DomainDeps {
  const env = getEnv();
  return {
    hostnames: getHostnameProvider(env),
    env,
    invalidate: (tags) => invalidateTags(tags),
    mailer: getMailer(),
    brand: env.BRAND_NAME,
    panelUrl: platformUrl("app", "/dashboard"),
  };
}
