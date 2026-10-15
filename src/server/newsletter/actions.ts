"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { CampaignType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { parseLocalDateTime } from "@/lib/timezone";
import { formValues, type ActionState } from "@/server/action-state";
import { audit } from "@/server/audit";
import { requirePermission, requireUser } from "@/server/auth/session";
import { getRateLimiter } from "@/server/rate-limit/limiter";

import * as admin from "./admin";
import { audienceSchema } from "./audience";

/** Campaign management (`newsletter.manage`) and the client's own newsletter consent. */

function newsletterError(error: unknown, values?: Record<string, string>): ActionState {
  if (error instanceof admin.NewsletterError) return { error: `newsletter.errors.${error.code}`, values };
  throw error;
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const campaignSchema = z.object({
  id: z.string().max(64).optional(),
  subject: z.string().trim().min(2).max(200),
  body: z.string().trim().min(10).max(20_000),
  ctaLabel: optional(60),
  ctaUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v))
    .transform((v) => v || null),
  type: z.enum([CampaignType.MARKETING, CampaignType.SERVICE]),
  segment: z.enum(["all", "plan", "noPlan", "license", "organization"]),
  planId: z.string().max(64).optional(),
  organizationId: z.string().max(64).optional(),
});

export async function saveCampaignAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("newsletter.manage");
  const values = formValues(formData);
  const parsed = campaignSchema.safeParse({ ctaLabel: "", ctaUrl: "", ...values });
  if (!parsed.success) return { error: "newsletter.errors.invalid", values };
  const { id, segment, planId, organizationId, ...input } = parsed.data;
  const audience = audienceSchema.safeParse({ segment, planId, organizationId });
  if (!audience.success) return { error: "newsletter.errors.audience", values };
  let savedId: string;
  try {
    savedId = (await admin.saveCampaign(id || null, { ...input, audience: audience.data }, actor.id)).id;
  } catch (error) {
    return newsletterError(error, values);
  }
  await audit(
    actor,
    id ? "newsletter.update" : "newsletter.create",
    { type: "Campaign", id: savedId },
    { subject: input.subject, type: input.type, audience: audience.data },
  );
  if (!id) redirect(`/newsletter/${savedId}`);
  refresh();
  return { ok: true };
}

export async function scheduleCampaignAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("newsletter.manage");
  const parsed = z
    .object({ id: z.string().min(1).max(64), at: z.string().max(40).optional() })
    .safeParse(formValues(formData));
  if (!parsed.success) return { error: "newsletter.errors.invalid" };
  // The admin types Polish wall-clock time.
  const at = parsed.data.at ? parseLocalDateTime(parsed.data.at) : null;
  if (parsed.data.at && !at) return { error: "newsletter.errors.invalid" };
  try {
    await admin.scheduleCampaign(parsed.data.id, at);
  } catch (error) {
    return newsletterError(error);
  }
  await audit(
    actor,
    at ? "newsletter.schedule" : "newsletter.send",
    { type: "Campaign", id: parsed.data.id },
    { at: at?.toISOString() ?? null },
  );
  refresh();
  return { ok: true };
}

export async function cancelCampaignAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("newsletter.manage");
  const id = String(formData.get("id") ?? "");
  try {
    await admin.cancelCampaign(id);
  } catch (error) {
    return newsletterError(error);
  }
  await audit(actor, "newsletter.cancel", { type: "Campaign", id });
  refresh();
  return { ok: true };
}

export async function sendCampaignTestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("newsletter.manage");
  if (!(await getRateLimiter().hit(`newsletter-test:${actor.id}`, 30, 60 * 60_000)).allowed)
    return { error: "billing.errors.rateLimited" };
  try {
    await admin.sendCampaignTest(String(formData.get("id") ?? ""), actor);
  } catch (error) {
    return newsletterError(error);
  }
  return { ok: true };
}

/** The client's opt-in/opt-out for marketing e-mails (account page). */
export async function setMarketingConsentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser("/account");
  const consent = formData.get("consent") === "1";
  await db.user.update({
    where: { id: user.id },
    data: { marketingConsent: consent, marketingConsentAt: consent ? new Date() : null },
  });
  refresh();
  return { ok: true };
}
