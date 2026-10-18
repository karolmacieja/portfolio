import { z } from "zod";

import { db } from "@/lib/db";
import { platformUrl } from "@/lib/env";
import { getPlatformBranding } from "@/server/branding/settings";
import { getInvoicingSettings } from "@/server/invoicing/settings";

/**
 * Look of every e-mail (Setting "mailBranding", admin /settings): logo (absolute https URL; mail clients don't
 * load relative or local images), accent colour of buttons and links, footer text (default: the seller's data).
 * Empty logo / colour = the platform branding's logo and primary colour (admin /branding).
 */
export const mailBrandingSchema = z.object({
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v))
    .default(""),
  accentColor: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)]).default(""),
  footerText: z.string().max(1000).default(""),
});
export type MailBranding = z.infer<typeof mailBrandingSchema>;

export type ResolvedBranding = { logoUrl: string | null; accentColor: string; footerLines: string[] };

const CACHE_MS = 60_000;
let cached: { value: ResolvedBranding; at: number } | null = null;

export async function getMailBrandingSettings(): Promise<MailBranding> {
  const row = await db.setting.findUnique({ where: { key: "mailBranding" } });
  const parsed = mailBrandingSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : mailBrandingSchema.parse({});
}

export async function saveMailBranding(branding: MailBranding): Promise<void> {
  const value = mailBrandingSchema.parse(branding);
  await db.setting.upsert({
    where: { key: "mailBranding" },
    update: { value },
    create: { key: "mailBranding", value },
  });
  cached = null;
}

/** Branding for rendering (cached a minute per process; never fails a mail: defaults on errors). */
export async function getMailBranding(): Promise<ResolvedBranding> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  let value: ResolvedBranding = { logoUrl: null, accentColor: "#18181b", footerLines: [] };
  try {
    const settings = await getMailBrandingSettings();
    let footer = settings.footerText.trim();
    if (!footer) {
      const { seller } = await getInvoicingSettings();
      footer = [
        seller.name,
        [seller.street, [seller.postalCode, seller.city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", "),
        seller.taxId ? `NIP ${seller.taxId}` : "",
        seller.email,
      ]
        .filter(Boolean)
        .join("\n");
    }
    const platform = await getPlatformBranding();
    // Mail clients need absolute URLs; local storage URLs are relative to the app host.
    const platformLogo = platform.logoUrl.startsWith("/")
      ? platformUrl("app", platform.logoUrl)
      : platform.logoUrl;
    value = {
      logoUrl: settings.logoUrl || platformLogo || null,
      accentColor: settings.accentColor || platform.primaryColor,
      footerLines: footer
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    };
  } catch (error) {
    console.error("[mail] branding unavailable, using defaults", error);
  }
  cached = { value, at: Date.now() };
  return value;
}
