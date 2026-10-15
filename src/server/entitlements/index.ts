import "server-only";

import { BLOCK_TYPES, type BlockType } from "@/blocks/schemas";
import { db } from "@/lib/db";

import { accessTierSchema, DEFAULT_BLOCK_TIERS, type BlockTiers } from "./rules";

export * from "./rules";
export { getEntitlements } from "./load";

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
