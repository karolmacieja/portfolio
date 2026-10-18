import { z } from "zod";

import { SOCIAL_PLATFORMS } from "@/blocks/schemas";
import { locales, type Locale } from "@/i18n/config";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { SITE_FONT_IDS } from "@/themes/fonts";

/**
 * Platform branding (Setting "platformBranding", admin /branding): service name, logo, favicon, colours,
 * font, contact data, social links and landing page text overrides. Worker-safe (no server-only): mails
 * rendered by the worker use the same name. An empty name falls back to BRAND_NAME.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = z.string().regex(HEX);
/** Our storage only (absolute URL of the public bucket, or the local /storage route). */
const assetUrl = z
  .string()
  .max(2048)
  .refine((v) => v === "" || /^(https?:\/\/|\/storage\/)/i.test(v), "invalidUrl");

export const FAVICON_SIZES = [32, 180, 192, 512] as const;
export const PLATFORM_FONTS = ["system", ...SITE_FONT_IDS] as const;

/** Landing page texts the admin may override (message keys; empty = the translated default). */
export const LANDING_TEXT_KEYS = [
  "home.title",
  "home.subtitle",
  "home.cta",
  "marketing.hero.note",
  "marketing.features.title",
  ...(["editor", "templates", "domain", "stats", "contact", "invoices"] as const).flatMap((f) => [
    `marketing.features.${f}.title` as const,
    `marketing.features.${f}.text` as const,
  ]),
  "marketing.templates.title",
  "marketing.templates.subtitle",
  "marketing.steps.title",
  ...(["account", "template", "publish"] as const).flatMap((s) => [
    `marketing.steps.${s}.title` as const,
    `marketing.steps.${s}.text` as const,
  ]),
  "marketing.pricing.title",
  "marketing.pricing.subtitle",
  "marketing.faq.title",
  ...(["trial", "publish", "cancel", "invoices", "domain", "data"] as const).flatMap((q) => [
    `marketing.faq.${q}.q` as const,
    `marketing.faq.${q}.a` as const,
  ]),
] as const;
export type LandingTextKey = (typeof LANDING_TEXT_KEYS)[number];

const landingTexts = z.record(z.string(), z.string().max(1500)).transform((record) =>
  Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([key, value]) => value && (LANDING_TEXT_KEYS as readonly string[]).includes(key)),
  ),
);

export const platformBrandingSchema = z.object({
  name: z.string().trim().max(60).default(""),
  tagline: z.string().trim().max(160).default(""),
  logoUrl: assetUrl.default(""),
  /** Generated PNGs per size (see FAVICON_SIZES); empty = the default icon. */
  favicon: z.record(z.string(), assetUrl).default({}),
  primaryColor: hex.default("#171717"),
  accentColor: hex.default("#171717"),
  font: z.enum(PLATFORM_FONTS).default("system"),
  contactEmail: z.union([z.literal(""), z.email().max(200)]).default(""),
  contactPhone: z.string().trim().max(40).default(""),
  socials: z
    .array(
      z.object({
        platform: z.enum(SOCIAL_PLATFORMS),
        url: z
          .string()
          .trim()
          .max(500)
          .refine((v) => /^(https?:\/\/|mailto:)/i.test(v), "invalidUrl"),
      }),
    )
    .max(12)
    .default([]),
  landing: z.partialRecord(z.enum(locales), landingTexts).default({}),
});
export type PlatformBranding = z.infer<typeof platformBrandingSchema>;

const KEY = "platformBranding";
const DEFAULTS = platformBrandingSchema.parse({});

export async function getPlatformBrandingSettings(): Promise<PlatformBranding> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  const parsed = platformBrandingSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : DEFAULTS;
}

const CACHE_MS = 60_000;
let cached: { value: PlatformBranding; at: number } | null = null;

/** Branding for rendering mails and pages (cached a minute per process; never throws). */
export async function getPlatformBranding(): Promise<PlatformBranding> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  let value = DEFAULTS;
  try {
    value = await getPlatformBrandingSettings();
  } catch (error) {
    console.error("[branding] settings unavailable, using defaults", error);
  }
  cached = { value, at: Date.now() };
  return value;
}

/** Merges a partial update into the stored branding (each admin form saves its own part). */
export async function savePlatformBranding(patch: Partial<PlatformBranding>): Promise<PlatformBranding> {
  const value = platformBrandingSchema.parse({ ...(await getPlatformBrandingSettings()), ...patch });
  await db.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  cached = null;
  return value;
}

/** The service name: the admin's choice, else BRAND_NAME from the environment. */
export function brandNameOf(branding: Pick<PlatformBranding, "name">): string {
  return branding.name || getEnv().BRAND_NAME;
}

export async function getBrandName(): Promise<string> {
  return brandNameOf(await getPlatformBranding());
}

/** A landing text override for the locale, or undefined (use the translated default). */
export function landingOverride(branding: PlatformBranding, locale: Locale, key: LandingTextKey) {
  return branding.landing[locale]?.[key];
}
