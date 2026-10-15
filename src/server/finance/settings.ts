import { z } from "zod";

import { db } from "@/lib/db";

/**
 * Cost settings for profit calculations (Setting "finance"), edited in admin /settings (owner decision: VAT,
 * payment fee, server cost per client and other fixed costs). Amounts in grosze.
 */
export const financeSettingsSchema = z.object({
  /** Payment provider fee: percent of the gross amount + fixed amount per charge (Stripe PL cards ~1.5 % + 1 zł). */
  feePercent: z.number().min(0).max(20).default(1.5),
  feeFixed: z.number().int().min(0).max(10_000).default(100),
  /** Monthly infrastructure bill (server, storage, mail, CDN). */
  infrastructureMonthly: z.number().int().min(0).max(100_000_000).default(20_000),
  /** "perClient": the bill divided by active paying clients; "fixed": `costPerClientMonthly` per client. */
  infrastructureMode: z.enum(["perClient", "fixed"]).default("perClient"),
  costPerClientMonthly: z.number().int().min(0).max(1_000_000).default(300),
  /** Other fixed monthly costs (accounting, invoicing service...), spread over active clients. */
  otherCosts: z
    .array(
      z.object({ name: z.string().trim().min(1).max(80), monthly: z.number().int().min(0).max(100_000_000) }),
    )
    .max(30)
    .default([]),
});
export type FinanceSettings = z.infer<typeof financeSettingsSchema>;

export async function getFinanceSettings(): Promise<FinanceSettings> {
  const row = await db.setting.findUnique({ where: { key: "finance" } });
  const parsed = financeSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : financeSettingsSchema.parse({});
}

export async function saveFinanceSettings(settings: FinanceSettings): Promise<void> {
  const value = financeSettingsSchema.parse(settings);
  await db.setting.upsert({
    where: { key: "finance" },
    update: { value },
    create: { key: "finance", value },
  });
}

/** Fixed monthly costs in total (infrastructure bill + other costs). */
export function fixedMonthlyCosts(settings: FinanceSettings): number {
  return settings.infrastructureMonthly + settings.otherCosts.reduce((sum, c) => sum + c.monthly, 0);
}

/** Cost of serving one client for a month given the number of active paying clients. */
export function clientCostMonthly(settings: FinanceSettings, activeClients: number): number {
  const clients = Math.max(activeClients, 1);
  const other = settings.otherCosts.reduce((sum, c) => sum + c.monthly, 0) / clients;
  const infrastructure =
    settings.infrastructureMode === "fixed"
      ? settings.costPerClientMonthly
      : settings.infrastructureMonthly / clients;
  return Math.round(infrastructure + other);
}
