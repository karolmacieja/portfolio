import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import { isLocale } from "@/i18n/config";

import { getRenderBranding } from "./public";
import type { LandingTextKey } from "./settings";

/**
 * Translator for the marketing pages: the admin's landing text override for the request locale,
 * else the translated default. Keys are full message keys (see LANDING_TEXT_KEYS).
 */
export async function getLandingTexts(): Promise<(key: LandingTextKey) => string> {
  const [locale, branding, t] = await Promise.all([getLocale(), getRenderBranding(), getTranslations()]);
  const overrides = isLocale(locale) ? (branding.landing[locale] ?? {}) : {};
  const translate = t as unknown as (key: string) => string;
  return (key) => overrides[key] || translate(key);
}
