import { z } from "zod";

import { db } from "@/lib/db";

/**
 * Admin-edited mail texts (Setting "mailTexts"): per locale and mail kind, optional subject/intro/cta
 * replacing the defaults from messages/*.json. Same placeholders ({brand}, {days}, ...) as the defaults.
 */
const textSchema = z.object({
  subject: z.string().max(200).optional(),
  intro: z.string().max(2000).optional(),
  cta: z.string().max(100).optional(),
});
export const mailOverridesSchema = z.record(z.string(), z.record(z.string(), textSchema));
export type MailOverrides = z.infer<typeof mailOverridesSchema>;

const CACHE_MS = 60_000;
let cached: { value: MailOverrides; at: number } | null = null;

/** Overrides, cached for a minute per process; mail never fails because of them (empty on errors). */
export async function getMailOverrides(): Promise<MailOverrides> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  try {
    const row = await db.setting.findUnique({ where: { key: "mailTexts" } });
    const parsed = mailOverridesSchema.safeParse(row?.value ?? {});
    cached = { value: parsed.success ? parsed.data : {}, at: Date.now() };
  } catch {
    cached = { value: {}, at: Date.now() };
  }
  return cached.value;
}

export async function saveMailOverride(
  locale: string,
  kind: string,
  text: { subject: string; intro: string; cta: string },
): Promise<void> {
  const current = mailOverridesSchema.safeParse(
    (await db.setting.findUnique({ where: { key: "mailTexts" } }))?.value ?? {},
  );
  const value: MailOverrides = current.success ? current.data : {};
  const cleaned = Object.fromEntries(Object.entries(text).filter(([, v]) => v.trim() !== ""));
  value[locale] = { ...(value[locale] ?? {}) };
  if (Object.keys(cleaned).length === 0) delete value[locale][kind];
  else value[locale][kind] = cleaned;
  await db.setting.upsert({
    where: { key: "mailTexts" },
    update: { value },
    create: { key: "mailTexts", value },
  });
  cached = null;
}
