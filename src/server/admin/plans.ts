import "server-only";

import type { BillingInterval, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getPaymentProvider } from "@/server/billing/provider";
import {
  ACCESS_TIERS,
  ENTITLED_STATUSES,
  planFeaturesSchema,
  type AccessTier,
  type PlanFeatures,
} from "@/server/entitlements";
import { siteTag } from "@/server/sites/cache-tags";

import { AdminError } from "./clients";

/**
 * Plan catalog (ADMIN, not owner-scoped). Prices are immutable once paid for: a new amount creates a
 * new price (synced to the provider) and deactivates the old one, which keeps serving existing
 * subscribers until they change plans.
 */

export type PlanInput = {
  slug: string;
  name: string;
  description: string | null;
  position: number;
  isActive: boolean;
  trialDays: number;
  maxSites: number;
  maxPagesPerSite: number;
  maxProjects: number | null;
  storageMb: number;
  features: PlanFeatures;
  accessTiers: AccessTier[];
};

export async function listPlansAdmin() {
  const plans = await db.plan.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { prices: { orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] } },
  });
  const counts = await db.subscription.groupBy({
    by: ["planId"],
    where: { status: { in: [...ENTITLED_STATUSES] } },
    _count: true,
  });
  return plans.map((plan) => ({
    ...plan,
    subscribers: counts.find((c) => c.planId === plan.id)?._count ?? 0,
  }));
}

function planData(input: PlanInput): Prisma.PlanUncheckedCreateInput {
  if (!/^[a-z0-9-]{2,40}$/.test(input.slug)) throw new AdminError("invalid");
  const accessTiers = ACCESS_TIERS.filter((tier) => input.accessTiers.includes(tier));
  if (!accessTiers.includes("basic")) accessTiers.unshift("basic");
  return {
    ...input,
    features: planFeaturesSchema.parse(input.features),
    accessTiers,
  };
}

/** Cache tags of public sites whose owners are on the plan (branding etc. follow plan features). */
async function subscriberSiteTags(planId: string): Promise<string[]> {
  const sites = await db.site.findMany({
    where: { owner: { subscriptions: { some: { planId, status: { in: [...ENTITLED_STATUSES] } } } } },
    select: { id: true },
  });
  return sites.map((site) => siteTag(site.id));
}

export async function savePlan(
  planId: string | null,
  input: PlanInput,
): Promise<{ id: string; invalidate: string[] }> {
  const data = planData(input);
  try {
    if (!planId) return { id: (await db.plan.create({ data })).id, invalidate: [] };
    await db.plan.update({ where: { id: planId }, data });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new AdminError("slugTaken");
    if ((error as { code?: string }).code === "P2025") throw new AdminError("notFound");
    throw error;
  }
  return { id: planId, invalidate: await subscriberSiteTags(planId) };
}

/**
 * Sets the gross price of a plan for an interval. Same amount: nothing changes. Otherwise a new price
 * row is created (and synced to the payment provider) and the previous one is deactivated.
 */
export async function setPlanPrice(planId: string, interval: BillingInterval, amount: number) {
  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new AdminError("notFound");
  if (!Number.isInteger(amount) || amount < 100) throw new AdminError("invalid");
  const current = await db.planPrice.findFirst({
    where: { planId, interval, currency: "PLN", isActive: true },
  });
  if (current?.amount === amount) return current;

  const provider = getPaymentProvider();
  let stripePriceId: string | null = null;
  if (provider.name === "stripe") {
    try {
      stripePriceId = await provider.syncPrice({
        planId,
        planName: plan.name,
        interval,
        amount,
        currency: "PLN",
      });
    } catch (error) {
      console.error("[admin] price sync failed", error);
      throw new AdminError("providerError");
    }
  }
  const [, created] = await db.$transaction([
    db.planPrice.updateMany({
      where: { planId, interval, currency: "PLN", isActive: true },
      data: { isActive: false },
    }),
    db.planPrice.create({ data: { planId, interval, amount, currency: "PLN", stripePriceId } }),
  ]);
  return created;
}

/** Creates provider prices for active prices that have none (e.g. after switching to Stripe). */
export async function syncAllPrices(): Promise<number> {
  const provider = getPaymentProvider();
  if (provider.name !== "stripe") return 0;
  const prices = await db.planPrice.findMany({
    where: { isActive: true, stripePriceId: null },
    include: { plan: { select: { name: true } } },
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
  }
  return prices.length;
}

export async function setBlockTier(blockType: string, requiredTier: AccessTier) {
  await db.blockAccess.upsert({
    where: { blockType },
    update: { requiredTier },
    create: { blockType, requiredTier },
  });
}
