import { z } from "zod";

import { db } from "@/lib/db";

/**
 * Sponsor footer removal add-on (Setting "sponsor"), set by admins (owner decision: admin chooses monthly or
 * one-time and the gross price). Disabled = members can't buy the removal themselves.
 */
export const sponsorSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.enum(["MONTHLY", "ONCE"]).default("MONTHLY"),
  /** Gross price in grosze. */
  amount: z.number().int().min(100).max(1_000_000).default(900),
});
export type SponsorSettings = z.infer<typeof sponsorSettingsSchema>;

export async function getSponsorSettings(): Promise<SponsorSettings> {
  const row = await db.setting.findUnique({ where: { key: "sponsor" } });
  const parsed = sponsorSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : sponsorSettingsSchema.parse({});
}

export async function saveSponsorSettings(settings: SponsorSettings): Promise<void> {
  const value = sponsorSettingsSchema.parse(settings);
  await db.setting.upsert({
    where: { key: "sponsor" },
    update: { value },
    create: { key: "sponsor", value },
  });
}
