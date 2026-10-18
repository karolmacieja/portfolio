"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { isLocale } from "@/i18n/config";
import { formValues, type ActionState } from "@/server/action-state";
import { audit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { getRateLimiter } from "@/server/rate-limit/limiter";

import { saveMailBranding } from "./branding";
import { getMailer } from "./index";
import { sampleMail } from "./samples";
import { LINK_MAIL_KINDS } from "./templates";

/** Mail look (ADMIN, `settings.manage`) and test sends of any template to the signed-in admin. */

export async function saveMailBrandingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("settings.manage");
  const values = formValues(formData);
  const parsed = z
    .object({
      logoUrl: z
        .string()
        .trim()
        .max(500)
        .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v)),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      accentFromPlatform: z.string().optional(),
      footerText: z.string().max(1000),
    })
    .safeParse({ logoUrl: "", footerText: "", ...values });
  if (!parsed.success) return { error: "adminSettings.errors.mailBranding", values };
  // "Like the platform" stores an empty colour, so later branding changes apply to mails too.
  const { accentFromPlatform, ...branding } = parsed.data;
  if (accentFromPlatform) branding.accentColor = "";
  await saveMailBranding(branding);
  await audit(actor, "settings.mailBranding", null, branding);
  refresh();
  return { ok: true };
}

export async function sendTestMailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("settings.manage");
  const parsed = z
    .object({ kind: z.enum(LINK_MAIL_KINDS), locale: z.string().refine(isLocale) })
    .safeParse(formValues(formData));
  if (!parsed.success) return { error: "adminSettings.errors.mailBranding" };
  if (!(await getRateLimiter().hit(`test-mail:${actor.id}`, 20, 60 * 60_000)).allowed)
    return { error: "billing.errors.rateLimited" };
  const mail = await sampleMail(parsed.data.kind, parsed.data.locale as "pl" | "en", actor.email);
  await getMailer().send({ ...mail, subject: `[TEST] ${mail.subject}` });
  return { ok: true };
}
