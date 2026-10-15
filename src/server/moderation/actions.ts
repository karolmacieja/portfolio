"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";

import { AbuseCategory } from "@/generated/prisma/enums";
import { getClientIp } from "@/lib/request";
import { formValues, type ActionState } from "@/server/action-state";
import { audit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { getRateLimiter, RATE_LIMITS } from "@/server/rate-limit/limiter";
import { invalidateTags } from "@/server/sites/invalidate";

import { ModerationError, moderateSite, reporterHash, resolveReport, submitReport } from "./service";

/** Public report form (anyone, rate limited per IP) and staff moderation decisions (audited). */

const reportSchema = z.object({
  siteId: z.string().min(1).max(64),
  path: z.string().trim().min(1).max(500),
  category: z.enum(Object.values(AbuseCategory) as [AbuseCategory, ...AbuseCategory[]]),
  description: z.string().trim().min(10).max(5000),
  reporterEmail: z.union([z.email().max(200), z.literal("")]).transform((value) => value || null),
  // Honeypot: real people never fill it.
  website: z.literal(""),
});

export async function submitReportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = reportSchema.safeParse({ reporterEmail: "", website: "", ...values });
  if (!parsed.success) return { error: "report.errors.invalid", values };
  const ip = getClientIp(await headers());
  const { limit, windowMs } = RATE_LIMITS.abuseReportPerIp;
  if (!(await getRateLimiter().hit(`report:${reporterHash(ip)}`, limit, windowMs)).allowed) {
    return { error: "report.errors.rateLimited", values };
  }
  try {
    const { website: _honeypot, ...input } = parsed.data;
    await submitReport({ ...input, ip });
  } catch (error) {
    if (error instanceof ModerationError) return { error: "report.errors.invalid", values };
    throw error;
  }
  return { ok: true };
}

const reason = z.string().trim().min(5).max(2000);

export async function resolveReportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("sites.moderate");
  const parsed = z
    .object({ reportId: z.string().min(1).max(64), decision: z.enum(["suspend", "dismiss"]), reason })
    .safeParse(formValues(formData));
  if (!parsed.success) return { error: "adminModeration.errors.reasonRequired" };
  try {
    const { tags, siteId } = await resolveReport(
      actor.id,
      parsed.data.reportId,
      parsed.data.decision,
      parsed.data.reason,
    );
    invalidateTags(tags);
    await audit(
      actor,
      `report.${parsed.data.decision}`,
      { type: "AbuseReport", id: parsed.data.reportId },
      {
        siteId,
        reason: parsed.data.reason,
      },
    );
  } catch (error) {
    if (error instanceof ModerationError) return { error: `adminModeration.errors.${error.code}` };
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function moderateSiteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("sites.moderate");
  const parsed = z
    .object({ siteId: z.string().min(1).max(64), suspend: z.enum(["1", "0"]), reason })
    .safeParse(formValues(formData));
  if (!parsed.success) return { error: "adminModeration.errors.reasonRequired" };
  const suspend = parsed.data.suspend === "1";
  try {
    invalidateTags(await moderateSite(parsed.data.siteId, suspend, parsed.data.reason));
    await audit(
      actor,
      suspend ? "site.suspend" : "site.unsuspend",
      { type: "Site", id: parsed.data.siteId },
      {
        reason: parsed.data.reason,
      },
    );
  } catch (error) {
    if (error instanceof ModerationError) return { error: `adminModeration.errors.${error.code}` };
    throw error;
  }
  refresh();
  return { ok: true };
}
