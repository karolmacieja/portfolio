import { SubscriptionStatus } from "@/generated/prisma/client";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { ENTITLED_STATUSES } from "@/server/entitlements/rules";
import { buildLinkMail } from "@/server/mail/templates";

import type { BillingDeps } from "./deps";
import { allSiteTags, suspendSitesForPayment } from "./sites";

/**
 * Worker (hourly): manually granted plans with an end date (comps, trials given by staff) end like a
 * provider subscription would: without another plan the client's sites are suspended and mailed.
 */
export async function expireManualPlans(deps: BillingDeps): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const expired = await db.subscription.findMany({
    where: {
      providerSubscriptionId: null,
      status: { in: [...ENTITLED_STATUSES] },
      currentPeriodEnd: { lt: now },
    },
    include: { user: { select: { email: true, locale: true } } },
  });
  for (const subscription of expired) {
    await db.subscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.CANCELED, canceledAt: now },
    });
    const stillEntitled = await db.subscription.count({
      where: { userId: subscription.userId, status: { in: [...ENTITLED_STATUSES] } },
    });
    const tags = await allSiteTags(subscription.userId);
    if (!stillEntitled) {
      tags.push(...(await suspendSitesForPayment(subscription.userId)));
      try {
        await deps.mailer.send(
          await buildLinkMail({
            kind: "subscriptionEnded",
            to: subscription.user.email,
            url: deps.billingUrl,
            locale: isLocale(subscription.user.locale) ? subscription.user.locale : "pl",
            brand: deps.brand,
          }),
        );
      } catch (error) {
        console.error("Failed to send subscriptionEnded mail", error);
      }
    }
    await deps.invalidate(tags);
  }
  return expired.length;
}
