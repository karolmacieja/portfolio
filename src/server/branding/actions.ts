"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { isLocale } from "@/i18n/config";
import { formValues, type ActionState } from "@/server/action-state";
import { audit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { invalidateTags } from "@/server/sites/invalidate";

import { PLATFORM_BRANDING_TAG } from "./public";
import {
  getPlatformBrandingSettings,
  LANDING_TEXT_KEYS,
  platformBrandingSchema,
  savePlatformBranding,
  type PlatformBranding,
} from "./settings";

/** Platform branding forms (ADMIN, `settings.manage`); each saves its own part of the setting. */

const ERROR = "adminBranding.errors.invalid";

async function save(patch: Partial<PlatformBranding>, part: string): Promise<ActionState> {
  const actor = await requirePermission("settings.manage");
  const parsed = platformBrandingSchema.partial().safeParse(patch);
  if (!parsed.success) return { error: ERROR };
  // Only the fields of this form: `.partial()` still fills the others with their defaults.
  const definedOnly = Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => Object.hasOwn(patch, key)),
  ) as Partial<PlatformBranding>;
  await savePlatformBranding(definedOnly);
  await audit(actor, "settings.branding", null, { part, ...definedOnly });
  // Panels read the branding per request; published client sites carry it in their ISR pages.
  invalidateTags([PLATFORM_BRANDING_TAG]);
  refresh();
  return { ok: true };
}

const json = (value: string | undefined) => {
  try {
    return JSON.parse(value ?? "");
  } catch {
    return undefined;
  }
};

export async function saveBrandIdentityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const v = formValues(formData);
  return save(
    {
      name: v.name ?? "",
      tagline: v.tagline ?? "",
      logoUrl: v.logoUrl ?? "",
      favicon: json(v.favicon) ?? {},
    },
    "identity",
  );
}

export async function saveBrandColorsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const v = formValues(formData);
  return save(
    { primaryColor: v.primaryColor, accentColor: v.accentColor, font: v.font as PlatformBranding["font"] },
    "colors",
  );
}

export async function saveBrandContactAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const v = formValues(formData);
  return save(
    {
      contactEmail: v.contactEmail ?? "",
      contactPhone: v.contactPhone ?? "",
      socials: json(v.socials) ?? [],
    },
    "contact",
  );
}

/** Landing texts for one locale; empty fields fall back to the translated defaults. */
export async function saveLandingTextsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const locale = String(formData.get("locale") ?? "");
  if (!isLocale(locale)) return { error: ERROR };
  const texts = z
    .record(z.string(), z.string())
    .parse(
      Object.fromEntries(
        LANDING_TEXT_KEYS.map((key) => [key, String(formData.get(`text:${key}`) ?? "")] as const),
      ),
    );
  const current = await getPlatformBrandingSettings();
  return save({ landing: { ...current.landing, [locale]: texts } }, `landing:${locale}`);
}
