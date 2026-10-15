import { z } from "zod";

import { db } from "@/lib/db";

/** Domain settings (Setting key "domains"), edited by admins: offered extensions and the price markup. */
export const domainSettingsSchema = z.object({
  /** Extensions offered for purchase, without the leading dot. */
  tlds: z
    .array(z.string().regex(/^[a-z]{2,24}(\.[a-z]{2,24})?$/))
    .min(1)
    .default(["pl", "com", "com.pl", "art.pl", "info.pl"]),
  /** Markup on the registrar cost, in percent... */
  markupPercent: z.number().min(0).max(500).default(30),
  /** ...but at least this much per year (net, grosze). */
  minMarkup: z.number().int().min(0).max(1_000_000).default(2000),
  /** PLN per unit of the registrar's currency (registrar prices are usually EUR). */
  exchangeRates: z.record(z.string(), z.number().positive()).default({ EUR: 4.3, USD: 4.0 }),
  /** Custom hostnames per site (incl. www/apex companions). */
  maxHostnamesPerSite: z.number().int().min(1).max(20).default(4),
});
export type DomainSettings = z.infer<typeof domainSettingsSchema>;

export async function getDomainSettings(): Promise<DomainSettings> {
  const row = await db.setting.findUnique({ where: { key: "domains" } });
  const parsed = domainSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : domainSettingsSchema.parse({});
}

export async function saveDomainSettings(settings: DomainSettings): Promise<void> {
  const value = domainSettingsSchema.parse(settings);
  await db.setting.upsert({
    where: { key: "domains" },
    update: { value },
    create: { key: "domains", value },
  });
}

/**
 * Yearly gross price for the client (grosze, rounded up to whole złoty): registrar cost converted to
 * PLN, plus max(markup %, minimum markup), plus VAT at the configured sales rate ("zw"/"0": none).
 * Returns null when the cost is in a currency without a configured rate.
 */
export function customerPrice(
  cost: { amount: number; currency: string },
  settings: Pick<DomainSettings, "markupPercent" | "minMarkup" | "exchangeRates">,
  vatRate: string,
): number | null {
  const rate = cost.currency === "PLN" ? 1 : settings.exchangeRates[cost.currency];
  if (!rate) return null;
  const costPln = Math.round(cost.amount * rate);
  const net = costPln + Math.max(Math.round((costPln * settings.markupPercent) / 100), settings.minMarkup);
  const percent = Number(vatRate);
  const gross = Number.isFinite(percent) ? net * (1 + percent / 100) : net;
  return Math.ceil(gross / 100) * 100;
}
