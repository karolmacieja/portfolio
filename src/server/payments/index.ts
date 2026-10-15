import type { Env } from "@/lib/env";

import { MockPaymentProvider } from "./mock";
import { StripePaymentProvider } from "./stripe";
import type { BillingEvent, PaymentProvider } from "./types";

export * from "./types";
export { MockPaymentProvider } from "./mock";

/** `emit` delivers in-process events (mock provider); Stripe delivers them via the webhook endpoint. */
export function createPaymentProvider(
  env: Env,
  emit: (event: BillingEvent) => Promise<void>,
): PaymentProvider {
  return env.PAYMENTS_PROVIDER === "stripe"
    ? new StripePaymentProvider(env.STRIPE_SECRET_KEY!, env.STRIPE_WEBHOOK_SECRET!)
    : new MockPaymentProvider(emit);
}
