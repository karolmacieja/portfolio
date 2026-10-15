import "server-only";

import { getEnv, platformUrl } from "@/lib/env";
import { getPaymentProvider } from "@/server/billing/provider";
import { getHostnameProvider, getRegistrar } from "@/server/domains/providers";
import { getMailer } from "@/server/mail";
import { invalidateTags } from "@/server/sites/invalidate";
import { getStorage } from "@/server/storage";

import type { AccountDeps } from "./deletion";

/** Account deletion side effects inside Next.js. */
export function nextAccountDeps(): AccountDeps {
  const env = getEnv();
  return {
    payments: getPaymentProvider(),
    hostnames: getHostnameProvider(env),
    registrar: getRegistrar(env),
    storage: getStorage(),
    mailer: getMailer(),
    invalidate: (tags) => invalidateTags(tags),
    brand: env.BRAND_NAME,
    accountUrl: platformUrl("app", "/account"),
  };
}
