import "dotenv/config";

import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { createPaymentProvider } from "@/server/payments";

/**
 * `pnpm billing:sync-prices`: creates the provider product/price for every active plan price that
 * has no `stripePriceId` yet. Prices are immutable at Stripe, so a changed amount needs a new
 * PlanPrice row (deactivate the old one) rather than an edit.
 */
async function main() {
  const env = getEnv();
  if (env.PAYMENTS_PROVIDER !== "stripe") {
    console.info("PAYMENTS_PROVIDER is not stripe; the mock provider uses PlanPrice ids directly.");
    return;
  }
  const provider = createPaymentProvider(env, async () => {});
  const prices = await db.planPrice.findMany({
    where: { isActive: true, stripePriceId: null, plan: { isActive: true } },
    include: { plan: true },
  });
  for (const price of prices) {
    const stripePriceId = await provider.syncPrice({
      planId: price.planId,
      planName: price.plan.name,
      interval: price.interval,
      amount: price.amount,
      currency: price.currency,
    });
    await db.planPrice.update({ where: { id: price.id }, data: { stripePriceId } });
    console.info(`${price.plan.name} ${price.interval}: ${stripePriceId}`);
  }
  console.info(`Synced ${prices.length} price(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
