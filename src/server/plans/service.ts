import "server-only";

import { BillingInterval } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { parseFeatures, type AccessTier, type PlanFeatures } from "@/server/entitlements";

export type PlanPriceCard = { id: string; amount: number; currency: string };

export type PlanCard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  trialDays: number;
  maxSites: number;
  maxPagesPerSite: number;
  maxProjects: number | null;
  storageMb: number;
  features: PlanFeatures;
  accessTiers: AccessTier[];
  highlights: string[];
  isFeatured: boolean;
  monthly: PlanPriceCard | null;
  yearly: PlanPriceCard | null;
};

/** Active plans with their active prices, in pricing-page order. */
export async function listActivePlans(): Promise<PlanCard[]> {
  const plans = await db.plan.findMany({
    where: { isActive: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { prices: { where: { isActive: true } } },
  });
  return plans.map((plan) => {
    const price = (interval: BillingInterval) => {
      const found = plan.prices.find((p) => p.interval === interval);
      return found ? { id: found.id, amount: found.amount, currency: found.currency } : null;
    };
    return {
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      description: plan.description,
      trialDays: plan.trialDays,
      maxSites: plan.maxSites,
      maxPagesPerSite: plan.maxPagesPerSite,
      maxProjects: plan.maxProjects,
      storageMb: plan.storageMb,
      features: parseFeatures(plan.features),
      accessTiers: plan.accessTiers as AccessTier[],
      highlights: plan.highlights,
      isFeatured: plan.isFeatured,
      monthly: price(BillingInterval.MONTH),
      yearly: price(BillingInterval.YEAR),
    };
  });
}
