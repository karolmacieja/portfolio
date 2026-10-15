import { SubscriptionStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { ACTIVE_LICENSE_STATUSES } from "@/server/entitlements/load";
import { getInvoicingSettings } from "@/server/invoicing/settings";

import type { CostInputs } from "./economics";
import { clientCostMonthly, getFinanceSettings, type FinanceSettings } from "./settings";

/** VAT rate of sales as a fraction ("zw"/"0" -> 0). */
export async function salesVatRate(): Promise<number> {
  const { vatRate } = await getInvoicingSettings();
  const rate = Number(vatRate);
  return Number.isFinite(rate) ? rate / 100 : 0;
}

/**
 * Clients that cost us money to serve and pay for it: users with a paying provider subscription plus seats
 * taken in active group licenses (each member is a site owner we host).
 */
export async function countActiveClients(): Promise<number> {
  const [subscribers, members] = await Promise.all([
    db.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        providerSubscriptionId: { not: null },
      },
      select: { userId: true },
      distinct: ["userId"],
    }),
    db.organizationMember.findMany({
      where: { organization: { status: { in: ACTIVE_LICENSE_STATUSES } } },
      select: { userId: true },
    }),
  ]);
  return new Set([...subscribers.map((s) => s.userId), ...members.map((m) => m.userId)]).size;
}

export async function getCostInputs(
  settings?: FinanceSettings,
): Promise<CostInputs & { activeClients: number }> {
  const [finance, vatRate, activeClients] = await Promise.all([
    settings ?? getFinanceSettings(),
    salesVatRate(),
    countActiveClients(),
  ]);
  return {
    vatRate,
    feePercent: finance.feePercent,
    feeFixed: finance.feeFixed,
    clientCostMonthly: clientCostMonthly(finance, activeClients),
    activeClients,
  };
}
