"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { BillingInterval } from "@/generated/prisma/enums";
import { formValues, type ActionState } from "@/server/action-state";
import { isImpersonating, requireUser } from "@/server/auth/session";
import { getRateLimiter, RATE_LIMITS } from "@/server/rate-limit/limiter";

import { LicenseError } from "./errors";
import * as service from "./service";

/** Group license actions for clients: buying, managing (manager), joining and leaving, sponsor removal. */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);
const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((value) => value === "" || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(value), "url")
  .transform((value) => value || null);

function licenseError(error: unknown, values?: Record<string, string>): ActionState {
  if (error instanceof LicenseError) return { error: `licenses.errors.${error.code}`, values };
  throw error;
}

async function checkoutAllowed(userId: string) {
  const { limit, windowMs } = RATE_LIMITS.checkoutPerUser;
  return (await getRateLimiter().hit(`checkout:user:${userId}`, limit, windowMs)).allowed;
}

async function payments(path: string) {
  const user = await requireUser(path);
  if (isImpersonating(user))
    return { user, blocked: { error: "billing.errors.impersonation" } as ActionState };
  return { user, blocked: null };
}

const purchaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  planId: z.string().min(1).max(64),
  seats: z.coerce.number().int().min(service.MIN_SEATS).max(service.MAX_SEATS),
  interval: z.enum([BillingInterval.MONTH, BillingInterval.YEAR]),
  sponsorName: optionalText(120),
  sponsorUrl: optionalUrl,
});

export async function startLicensePurchaseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, blocked } = await payments("/licenses");
  if (blocked) return blocked;
  const values = formValues(formData);
  const parsed = purchaseSchema.safeParse(values);
  if (!parsed.success) return { error: "licenses.errors.invalid", values };
  if (!(await checkoutAllowed(user.id))) return { error: "billing.errors.rateLimited", values };
  let url: string;
  try {
    url = await service.startLicensePurchase(user.id, parsed.data);
  } catch (error) {
    return licenseError(error, values);
  }
  redirect(url);
}

const organizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sponsorName: optionalText(120),
  sponsorUrl: optionalUrl,
  joinLinkEnabled: z.literal("on").optional().transform(Boolean),
});

export async function updateOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/organization");
  const parsed = organizationSchema.safeParse(formValues(formData));
  if (!parsed.success) return { error: "licenses.errors.invalid" };
  try {
    await service.updateOrganization(user.id, parsed.data);
  } catch (error) {
    return licenseError(error);
  }
  refresh();
  return { ok: true };
}

export async function regenerateJoinCodeAction(_prev: ActionState): Promise<ActionState> {
  const user = await requireUser("/organization");
  try {
    await service.regenerateJoinCode(user.id);
  } catch (error) {
    return licenseError(error);
  }
  refresh();
  return { ok: true };
}

export async function inviteMembersAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/organization");
  const raw = String(formData.get("emails") ?? "");
  const emails = raw.split(/[\s,;]+/).filter(Boolean);
  const parsed = z.array(z.email().max(254)).min(1).max(100).safeParse(emails);
  if (!parsed.success) return { error: "licenses.errors.invalidEmails", values: { emails: raw } };
  const { limit, windowMs } = RATE_LIMITS.licenseInvitesPerUser;
  if (!(await getRateLimiter().hit(`license-invites:${user.id}`, limit, windowMs)).allowed)
    return { error: "billing.errors.rateLimited", values: { emails: raw } };
  try {
    const sent = await service.inviteMembers(user.id, parsed.data);
    refresh();
    return { ok: true, values: { sent: String(sent) } };
  } catch (error) {
    return licenseError(error, { emails: raw });
  }
}

const idSchema = z.object({ id: z.string().min(1).max(64) });

export async function revokeInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/organization");
  const parsed = idSchema.safeParse(formValues(formData));
  if (!parsed.success) return { error: "licenses.errors.notFound" };
  try {
    await service.revokeInvite(user.id, parsed.data.id);
  } catch (error) {
    return licenseError(error);
  }
  refresh();
  return { ok: true };
}

export async function removeMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/organization");
  const parsed = idSchema.safeParse(formValues(formData));
  if (!parsed.success) return { error: "licenses.errors.notFound" };
  try {
    await service.removeMember(user.id, parsed.data.id);
  } catch (error) {
    return licenseError(error);
  }
  refresh();
  return { ok: true };
}

export async function changeSeatsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, blocked } = await payments("/organization");
  if (blocked) return blocked;
  const parsed = z
    .object({ seats: z.coerce.number().int().min(service.MIN_SEATS).max(service.MAX_SEATS) })
    .safeParse(formValues(formData));
  if (!parsed.success) return { error: "licenses.errors.invalid" };
  try {
    await service.changeSeats(user.id, parsed.data.seats);
  } catch (error) {
    return licenseError(error);
  }
  refresh();
  return { ok: true };
}

export async function setLicenseRenewalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, blocked } = await payments("/organization");
  if (blocked) return blocked;
  try {
    await service.setLicenseCancelAtPeriodEnd(user.id, formData.get("cancel") === "1");
  } catch (error) {
    return licenseError(error);
  }
  refresh();
  return { ok: true };
}

export async function joinOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/dashboard");
  if (isImpersonating(user)) return { error: "account.errors.impersonation" };
  const parsed = z
    .object({ code: z.string().max(64).optional(), invite: z.string().max(128).optional() })
    .safeParse(formValues(formData));
  if (!parsed.success) return { error: "licenses.errors.inviteInvalid" };
  try {
    await service.joinOrganization(user.id, parsed.data);
  } catch (error) {
    return licenseError(error);
  }
  redirect("/organization?joined=1");
}

export async function leaveOrganizationAction(_prev: ActionState): Promise<ActionState> {
  const user = await requireUser("/organization");
  if (isImpersonating(user)) return { error: "account.errors.impersonation" };
  try {
    await service.leaveOrganization(user.id);
  } catch (error) {
    return licenseError(error);
  }
  redirect("/dashboard");
}

export async function startSponsorRemovalAction(_prev: ActionState): Promise<ActionState> {
  const { user, blocked } = await payments("/organization");
  if (blocked) return blocked;
  if (!(await checkoutAllowed(user.id))) return { error: "billing.errors.rateLimited" };
  let url: string;
  try {
    url = await service.startSponsorRemoval(user.id);
  } catch (error) {
    return licenseError(error);
  }
  redirect(url);
}

export async function cancelSponsorRemovalAction(_prev: ActionState): Promise<ActionState> {
  const { user, blocked } = await payments("/organization");
  if (blocked) return blocked;
  try {
    await service.cancelSponsorRemoval(user.id);
  } catch (error) {
    return licenseError(error);
  }
  refresh();
  return { ok: true };
}
