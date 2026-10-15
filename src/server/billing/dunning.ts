import { SubscriptionStatus } from "@/generated/prisma/enums";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { buildLinkMail } from "@/server/mail/templates";

import type { BillingDeps } from "./deps";
import { getBillingSettings } from "./settings";
import { loadLicense } from "@/server/entitlements/load";

import { suspendSitesForPayment } from "./sites";

const DAY_MS = 86_400_000;
/** `dunningStage` value after the sites were suspended. */
export const DUNNING_SUSPENDED = -1;

/**
 * Dunning pass (run hourly by the worker): sends reminder emails for past-due subscriptions and
 * suspends the client's sites once the grace period is over. Paying (invoice.paid) or a healthy
 * subscription update resets the state and restores the sites.
 */
export async function runDunning(deps: BillingDeps): Promise<{ reminders: number; suspended: number }> {
  const settings = await getBillingSettings();
  const reminderDays = [...settings.reminderDays].sort((a, b) => a - b);
  const now = deps.now?.() ?? new Date();
  const result = { reminders: 0, suspended: 0 };

  const pastDue = await db.subscription.findMany({
    where: {
      pastDueSince: { not: null },
      dunningStage: { gte: 0 },
      status: { in: [SubscriptionStatus.PAST_DUE, SubscriptionStatus.UNPAID] },
    },
    include: { user: { select: { email: true, locale: true } } },
  });

  for (const subscription of pastDue) {
    const days = Math.floor((now.getTime() - subscription.pastDueSince!.getTime()) / DAY_MS);
    const locale = isLocale(subscription.user.locale) ? subscription.user.locale : "pl";
    const mail = async (kind: "paymentReminder" | "sitesSuspended") =>
      deps.mailer
        .send(
          await buildLinkMail({
            kind,
            to: subscription.user.email,
            url: deps.billingUrl,
            locale,
            brand: deps.brand,
            values: { days: Math.max(settings.gracePeriodDays - days, 0) },
          }),
        )
        .catch((error) => console.error(`Failed to send ${kind} mail`, error));

    if (days >= settings.gracePeriodDays) {
      // Members of an active group license keep their sites running on their seat.
      if (!(await loadLicense(subscription.userId))) {
        await deps.invalidate(await suspendSitesForPayment(subscription.userId));
      }
      await db.subscription.update({
        where: { id: subscription.id },
        data: { dunningStage: DUNNING_SUSPENDED },
      });
      await mail("sitesSuspended");
      result.suspended += 1;
      continue;
    }
    // Stage 1 = the day-0 notice was sent; stage n+1 = reminder n sent.
    const nextReminder = reminderDays[Math.max(subscription.dunningStage - 1, 0)];
    if (nextReminder !== undefined && days >= nextReminder) {
      await db.subscription.update({
        where: { id: subscription.id },
        data: { dunningStage: Math.max(subscription.dunningStage, 1) + 1 },
      });
      await mail("paymentReminder");
      result.reminders += 1;
    }
  }
  return result;
}
