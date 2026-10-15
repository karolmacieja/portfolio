import { z } from "zod";

import { db } from "@/lib/db";

/**
 * Server capacity (Setting "capacity") for the scaling forecast: what the current setup handles comfortably.
 * Zero = not tracked. The forecast warns when a metric is projected to cross `warnAtPercent` of its capacity.
 */
export const capacitySettingsSchema = z.object({
  /** Disk available to PostgreSQL. */
  databaseGb: z.number().min(0).default(40),
  /** Media storage budget (R2 is elastic; this is the size you plan for / pay for). */
  storageGb: z.number().min(0).default(100),
  /** Page views per month the web servers handle comfortably. */
  monthlyPageViews: z.number().int().min(0).default(2_000_000),
  /** Published sites per web instance (ISR cache, memory). */
  activeSites: z.number().int().min(0).default(5_000),
  warnAtPercent: z.number().int().min(10).max(100).default(80),
});
export type CapacitySettings = z.infer<typeof capacitySettingsSchema>;

export async function getCapacitySettings(): Promise<CapacitySettings> {
  const row = await db.setting.findUnique({ where: { key: "capacity" } });
  const parsed = capacitySettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : capacitySettingsSchema.parse({});
}

export async function saveCapacitySettings(settings: CapacitySettings): Promise<void> {
  const value = capacitySettingsSchema.parse(settings);
  await db.setting.upsert({
    where: { key: "capacity" },
    update: { value },
    create: { key: "capacity", value },
  });
}
