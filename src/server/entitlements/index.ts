import "server-only";

import { BLOCK_TYPES, type BlockType } from "@/blocks/schemas";
import { db } from "@/lib/db";

import {
  accessTierSchema,
  buildEntitlements,
  DEFAULT_BLOCK_TIERS,
  ENTITLED_STATUSES,
  type BlockTiers,
  type Entitlements,
} from "./rules";

export * from "./rules";

/**
 * Loads a user's entitlements: the newest entitled subscription's plan, otherwise the entry plan's
 * limits without publishing or paid features. Deliberately not memoized (React `cache` outside a
 * render memoizes forever, which would hide plan changes); it's two indexed queries.
 */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  const [subscription, fallbackPlan] = await Promise.all([
    db.subscription.findFirst({
      where: { userId, status: { in: [...ENTITLED_STATUSES] } },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    }),
    db.plan.findFirst({ where: { isActive: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
  ]);
  return buildEntitlements(subscription, fallbackPlan);
}

/** Required tier per block type: DB overrides on top of the code defaults. */
export async function getBlockTiers(): Promise<BlockTiers> {
  const rows = await db.blockAccess.findMany();
  const tiers: BlockTiers = { ...DEFAULT_BLOCK_TIERS };
  for (const row of rows) {
    const tier = accessTierSchema.safeParse(row.requiredTier);
    if (tier.success && (BLOCK_TYPES as string[]).includes(row.blockType))
      tiers[row.blockType as BlockType] = tier.data;
  }
  return tiers;
}

export type Usage = { sites: number; storageBytes: number };

export async function getUsage(userId: string): Promise<Usage> {
  const [sites, storage] = await Promise.all([
    db.site.count({ where: { ownerId: userId } }),
    db.asset.aggregate({ where: { ownerId: userId }, _sum: { sizeBytes: true } }),
  ]);
  return { sites, storageBytes: storage._sum.sizeBytes ?? 0 };
}
