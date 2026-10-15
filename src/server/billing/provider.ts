import "server-only";

import { getEnv, platformUrl } from "@/lib/env";
import { enqueueInvoice } from "@/server/jobs/queues";
import { getMailer } from "@/server/mail";
import { createPaymentProvider, type BillingEvent, type PaymentProvider } from "@/server/payments";
import { invalidateTags } from "@/server/sites/invalidate";

import type { BillingDeps } from "./deps";
import { handleBillingEvent } from "./events";

/** Billing side effects inside Next.js: cache invalidation via revalidateTag. */
export function nextBillingDeps(): BillingDeps {
  return {
    invalidate: (tags) => invalidateTags(tags),
    mailer: getMailer(),
    brand: getEnv().BRAND_NAME,
    billingUrl: platformUrl("app", "/billing"),
    enqueueInvoice: (invoiceId) => enqueueInvoice(invoiceId),
  };
}

const globalForPayments = globalThis as unknown as { paymentProvider?: PaymentProvider };

/** The configured provider; mock events are handled in-process like webhooks. */
export function getPaymentProvider(): PaymentProvider {
  globalForPayments.paymentProvider ??= createPaymentProvider(getEnv(), async (event: BillingEvent) => {
    await handleBillingEvent(event, "mock", nextBillingDeps());
  });
  return globalForPayments.paymentProvider;
}
