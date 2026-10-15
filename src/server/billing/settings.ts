import { z } from "zod";

import { db } from "@/lib/db";

/** Billing settings (Setting key "billing"); admins edit them in Phase 8. */
export const billingSettingsSchema = z.object({
  /** Days after the first failed payment before the client's sites are suspended. */
  gracePeriodDays: z.number().int().min(0).max(60).default(7),
  /** Reminder emails, in days after the first failure (the day-0 notice is sent immediately). */
  reminderDays: z.array(z.number().int().min(1).max(60)).max(10).default([3, 6]),
});
export type BillingSettings = z.infer<typeof billingSettingsSchema>;

export async function getBillingSettings(): Promise<BillingSettings> {
  const row = await db.setting.findUnique({ where: { key: "billing" } });
  const parsed = billingSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : billingSettingsSchema.parse({});
}
