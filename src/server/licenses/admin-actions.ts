"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { LicenseStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { formValues, type ActionState } from "@/server/action-state";
import { audit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";

import * as admin from "./admin";
import { LicenseError } from "./errors";
import { saveSponsorSettings } from "./settings";

/** Staff actions on group licenses (`licenses.manage`), seat prices and the sponsor add-on (ADMIN). */

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
  .refine((value) => value === "" || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(value))
  .transform((value) => value || null);
const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || !Number.isNaN(Date.parse(value)))
  .transform((value) => (value ? new Date(`${value}T23:59:59`) : null));
const money = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Math.round(Number(v.replace(",", ".")) * 100)))
  .pipe(z.number().int().min(100).max(10_000_000).nullable());

function licenseError(error: unknown, values?: Record<string, string>): ActionState {
  if (error instanceof LicenseError) return { error: `licenses.errors.${error.code}`, values };
  throw error;
}

const licenseFields = {
  name: z.string().trim().min(2).max(120),
  planId: z.string().min(1).max(64),
  seats: z.coerce.number().int().min(1).max(100_000),
  validUntil: optionalDate,
  note: optionalText(2000),
  sponsorName: optionalText(120),
  sponsorUrl: optionalUrl,
};

export async function createManualLicenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("licenses.manage");
  const values = formValues(formData);
  const parsed = z
    .object({ ...licenseFields, managerEmail: z.email().max(254) })
    .safeParse({ note: "", sponsorName: "", sponsorUrl: "", validUntil: "", ...values });
  if (!parsed.success) return { error: "licenses.errors.invalid", values };
  let id: string;
  try {
    const org = await admin.createManualLicense({
      ...parsed.data,
      membersCanBuyDomains: formData.get("membersCanBuyDomains") === "on",
    });
    id = org.id;
  } catch (error) {
    return licenseError(error, values);
  }
  await audit(actor, "license.create", { type: "Organization", id }, { ...parsed.data });
  redirect(`/licenses/${id}`);
}

export async function updateLicenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("licenses.manage");
  const values = formValues(formData);
  const parsed = z
    .object({
      id: z.string().min(1).max(64),
      ...licenseFields,
      status: z
        .enum([LicenseStatus.ACTIVE, LicenseStatus.EXPIRED, LicenseStatus.CANCELED, ""])
        .default("")
        .transform((v) => v || null),
    })
    .safeParse({ note: "", sponsorName: "", sponsorUrl: "", validUntil: "", ...values });
  if (!parsed.success) return { error: "licenses.errors.invalid", values };
  const { id, ...input } = parsed.data;
  try {
    await admin.updateOrganizationAdmin(id, {
      ...input,
      sponsorFooter: formData.get("sponsorFooter") === "on",
      membersCanBuyDomains: formData.get("membersCanBuyDomains") === "on",
    });
  } catch (error) {
    return licenseError(error, values);
  }
  await audit(actor, "license.update", { type: "Organization", id }, { ...input });
  refresh();
  return { ok: true };
}

const memberSchema = z.object({
  organizationId: z.string().min(1).max(64),
  userId: z.string().min(1).max(64),
});

export async function setMemberSponsorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("licenses.manage");
  const parsed = memberSchema.extend({ hidden: z.enum(["0", "1"]) }).safeParse(formValues(formData));
  if (!parsed.success) return { error: "licenses.errors.notFound" };
  try {
    await admin.setMemberSponsorHidden(
      parsed.data.organizationId,
      parsed.data.userId,
      parsed.data.hidden === "1",
    );
  } catch (error) {
    return licenseError(error);
  }
  await audit(
    actor,
    "license.memberSponsor",
    { type: "User", id: parsed.data.userId },
    { hidden: parsed.data.hidden },
  );
  refresh();
  return { ok: true };
}

export async function addMemberAdminAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("licenses.manage");
  const parsed = z
    .object({ organizationId: z.string().min(1).max(64), email: z.email().max(254) })
    .safeParse(formValues(formData));
  if (!parsed.success) return { error: "licenses.errors.invalid" };
  try {
    await admin.addMemberAdmin(parsed.data.organizationId, parsed.data.email);
  } catch (error) {
    return licenseError(error);
  }
  await audit(
    actor,
    "license.memberAdd",
    { type: "Organization", id: parsed.data.organizationId },
    { email: parsed.data.email },
  );
  refresh();
  return { ok: true };
}

export async function removeMemberAdminAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("licenses.manage");
  const parsed = memberSchema.safeParse(formValues(formData));
  if (!parsed.success) return { error: "licenses.errors.notFound" };
  try {
    await admin.removeMemberAdmin(parsed.data.organizationId, parsed.data.userId);
  } catch (error) {
    return licenseError(error);
  }
  await audit(
    actor,
    "license.memberRemove",
    { type: "User", id: parsed.data.userId },
    { organizationId: parsed.data.organizationId },
  );
  refresh();
  return { ok: true };
}

export async function setSeatPricesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("plans.manage");
  const parsed = z
    .object({ planId: z.string().min(1).max(64), seatPriceMonthly: money, seatPriceYearly: money })
    .safeParse({ seatPriceMonthly: "", seatPriceYearly: "", ...formValues(formData) });
  if (!parsed.success) return { error: "licenses.errors.invalid" };
  const { planId, ...prices } = parsed.data;
  await db.plan.update({ where: { id: planId }, data: prices });
  await audit(actor, "plan.seatPrices", { type: "Plan", id: planId }, prices);
  refresh();
  return { ok: true };
}

export async function saveSponsorSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("settings.manage");
  const values = formValues(formData);
  const parsed = z
    .object({
      mode: z.enum(["MONTHLY", "ONCE"]),
      amount: z
        .string()
        .transform((v) => Math.round(Number(v.replace(",", ".")) * 100))
        .pipe(z.number().int().min(100).max(1_000_000)),
    })
    .safeParse(values);
  if (!parsed.success) return { error: "licenses.errors.invalid", values };
  const settings = { ...parsed.data, enabled: formData.get("enabled") === "on" };
  await saveSponsorSettings(settings);
  await audit(actor, "settings.sponsor", null, settings);
  refresh();
  return { ok: true };
}
