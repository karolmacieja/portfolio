"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { BLOCK_TYPES } from "@/blocks/schemas";
import { BillingInterval, Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { formValues, type ActionState } from "@/server/action-state";
import { audit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { billingSettingsSchema } from "@/server/billing/settings";
import { ACCESS_TIERS, PLAN_FEATURES } from "@/server/entitlements";
import { saveMailOverride } from "@/server/mail/overrides";
import { LINK_MAIL_KINDS } from "@/server/mail/templates";
import { invalidateTags } from "@/server/sites/invalidate";

import { AdminError } from "./clients";
import { savePlan, setBlockTier, setPlanPrice, syncAllPrices } from "./plans";
import { setUserRole } from "./staff";

/** Plan catalog, block tiers, team roles and platform settings: ADMIN only, audited. */

async function run(fn: () => Promise<unknown>, values?: Record<string, string>): Promise<ActionState> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof AdminError) return { error: `adminClients.errors.${error.code}`, values };
    throw error;
  }
  refresh();
  return { ok: true, values };
}

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const planSchema = z.object({
  planId: z.string().max(64).optional(),
  slug: z.string().trim().toLowerCase().min(2).max(40),
  name: z.string().trim().min(1).max(60),
  description: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null),
  position: int(0, 1000),
  trialDays: int(0, 90),
  maxSites: int(1, 1000),
  maxPagesPerSite: int(1, 1000),
  maxProjects: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int().min(0).max(100_000).nullable()),
  storageMb: int(10, 1_000_000),
});

export async function savePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("plans.manage");
  const values = formValues(formData);
  const parsed = planSchema.safeParse({ description: "", maxProjects: "", ...values });
  if (!parsed.success) return { error: "adminClients.errors.invalid", values };
  const { planId, ...rest } = parsed.data;
  const features = Object.fromEntries(PLAN_FEATURES.map((f) => [f, formData.get(`feature.${f}`) === "on"]));
  const accessTiers = ACCESS_TIERS.filter((tier) => formData.get(`tier.${tier}`) === "on");
  return run(async () => {
    const saved = await savePlan(planId || null, {
      ...rest,
      isActive: formData.get("isActive") === "on",
      features: features as never,
      accessTiers,
    });
    invalidateTags(saved.invalidate);
    await audit(
      actor,
      planId ? "plan.update" : "plan.create",
      { type: "Plan", id: saved.id },
      { ...rest, features, accessTiers },
    );
  }, values);
}

export async function setPlanPriceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("plans.manage");
  const parsed = z
    .object({
      planId: z.string().min(1).max(64),
      interval: z.enum([BillingInterval.MONTH, BillingInterval.YEAR]),
      amount: z
        .string()
        .transform((v) => Math.round(Number(v.replace(",", ".")) * 100))
        .pipe(z.number().int().min(100).max(10_000_000)),
    })
    .safeParse(formValues(formData));
  if (!parsed.success) return { error: "adminClients.errors.invalid" };
  return run(async () => {
    const price = await setPlanPrice(parsed.data.planId, parsed.data.interval, parsed.data.amount);
    await audit(
      actor,
      "plan.price",
      { type: "Plan", id: parsed.data.planId },
      {
        interval: parsed.data.interval,
        amount: parsed.data.amount,
        priceId: price.id,
      },
    );
  });
}

export async function syncPricesAction(_prev: ActionState): Promise<ActionState> {
  const actor = await requirePermission("plans.manage");
  return run(async () => {
    const synced = await syncAllPrices();
    await audit(actor, "plan.syncPrices", null, { synced });
  });
}

export async function setBlockTierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("plans.manage");
  const parsed = z
    .object({ blockType: z.enum(BLOCK_TYPES as [string, ...string[]]), tier: z.enum(ACCESS_TIERS) })
    .safeParse(formValues(formData));
  if (!parsed.success) return { error: "adminClients.errors.invalid" };
  return run(async () => {
    await setBlockTier(parsed.data.blockType, parsed.data.tier);
    await audit(
      actor,
      "block.tier",
      { type: "BlockAccess", id: parsed.data.blockType },
      { tier: parsed.data.tier },
    );
  });
}

export async function setUserRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("staff.manage");
  const values = formValues(formData);
  const parsed = z
    .object({ email: z.email().max(254), role: z.enum([Role.ADMIN, Role.SUPPORT, Role.CLIENT]) })
    .safeParse(values);
  if (!parsed.success) return { error: "adminClients.errors.invalid", values };
  return run(async () => {
    const changed = await setUserRole(actor.id, parsed.data.email, parsed.data.role);
    await audit(
      actor,
      "staff.role",
      { type: "User", id: changed.id },
      { from: changed.previous, to: parsed.data.role },
    );
  }, values);
}

export async function saveBillingSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("settings.manage");
  const values = formValues(formData);
  const parsed = billingSettingsSchema.safeParse({
    gracePeriodDays: Number(values.gracePeriodDays),
    reminderDays: (values.reminderDays ?? "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number),
  });
  if (!parsed.success) return { error: "adminSettings.errors.invalid", values };
  await db.setting.upsert({
    where: { key: "billing" },
    update: { value: parsed.data },
    create: { key: "billing", value: parsed.data },
  });
  await audit(actor, "settings.billing", null, { ...parsed.data });
  refresh();
  return { ok: true, values };
}

export async function saveMailTextAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("settings.manage");
  const values = formValues(formData);
  const parsed = z
    .object({
      locale: z.enum(["pl", "en"]),
      kind: z.enum(LINK_MAIL_KINDS),
      subject: z.string().max(200),
      intro: z.string().max(2000),
      cta: z.string().max(100),
    })
    .safeParse({ subject: "", intro: "", cta: "", ...values });
  if (!parsed.success) return { error: "adminSettings.errors.invalid", values };
  const { locale, kind, ...text } = parsed.data;
  await saveMailOverride(locale, kind, text);
  await audit(actor, "settings.mailText", null, { locale, kind });
  refresh();
  return { ok: true, values };
}
