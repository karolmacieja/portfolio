"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { DomainOrderStatus, Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { formValues, type ActionState } from "@/server/action-state";
import { STAFF_ROLES } from "@/server/auth/roles";
import { requireRole, requireUser } from "@/server/auth/session";
import { enqueueDomainJob } from "@/server/jobs/queues";
import { getRateLimiter, RATE_LIMITS } from "@/server/rate-limit/limiter";

import { nextDomainDeps } from "./deps";
import { DomainError } from "./errors";
import { getHostnameProvider } from "./providers";
import * as purchase from "./purchase";
import * as service from "./service";
import { domainSettingsSchema, saveDomainSettings } from "./settings";
import { applyHostnameState } from "./status";

/** Domain actions: client (owner-scoped through the services) and staff. */

export type DomainSearchState = ActionState & { offers?: purchase.DomainOffer[]; query?: string };
export type AuthCodeState = ActionState & { code?: string };

const id = z.string().min(1).max(64);

async function limited(userId: string, policy: keyof typeof RATE_LIMITS): Promise<boolean> {
  const { limit, windowMs } = RATE_LIMITS[policy];
  return !(await getRateLimiter().hit(`${policy}:${userId}`, limit, windowMs)).allowed;
}

async function run(fn: () => Promise<unknown>, values?: Record<string, string>): Promise<ActionState> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof DomainError) return { error: `domains.errors.${error.code}`, values };
    throw error;
  }
  refresh();
  return { ok: true };
}

// --- Connected domains ---------------------------------------------------------------------

export async function addDomainAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/dashboard");
  const values = formValues(formData);
  const siteId = id.safeParse(values.siteId);
  const hostname = z.string().trim().min(1).max(300).safeParse(values.hostname);
  if (!siteId.success || !hostname.success) return { error: "domains.errors.hostname.invalid", values };
  if (await limited(user.id, "domainChangesPerUser")) return { error: "domains.errors.rateLimited", values };
  return run(
    () =>
      service.addDomain(
        user.id,
        siteId.data,
        { hostname: hostname.data, includeCompanion: values.includeCompanion === "on" },
        nextDomainDeps(),
      ),
    values,
  );
}

function domainAction(fn: (userId: string, domainId: string) => Promise<unknown>, limit = false) {
  return async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    const user = await requireUser("/dashboard");
    const domainId = id.safeParse(formData.get("domainId"));
    if (!domainId.success) return { error: "domains.errors.notFound" };
    if (limit && (await limited(user.id, "domainChangesPerUser")))
      return { error: "domains.errors.rateLimited" };
    return run(() => fn(user.id, domainId.data));
  };
}

export const removeDomainAction = domainAction((userId, domainId) =>
  service.removeDomain(userId, domainId, nextDomainDeps()),
);
export const setPrimaryDomainAction = domainAction((userId, domainId) =>
  service.setPrimaryDomain(userId, domainId, nextDomainDeps()),
);
export const checkDomainAction = domainAction(
  (userId, domainId) => service.checkDomainNow(userId, domainId, nextDomainDeps()),
  true,
);
export const reenableDomainAction = domainAction(
  (userId, domainId) => service.reenableDomain(userId, domainId, nextDomainDeps()),
  true,
);

export async function clearPrimaryDomainAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/dashboard");
  const siteId = id.safeParse(formData.get("siteId"));
  if (!siteId.success) return { error: "domains.errors.notFound" };
  return run(() => service.clearPrimaryDomain(user.id, siteId.data, nextDomainDeps()));
}

// --- Buying domains ------------------------------------------------------------------------

export async function searchDomainsAction(
  _prev: DomainSearchState,
  formData: FormData,
): Promise<DomainSearchState> {
  const user = await requireUser("/dashboard");
  const query = z.string().trim().min(1).max(100).safeParse(formData.get("query"));
  if (!query.success) return { error: "domains.errors.hostname.invalid" };
  if (await limited(user.id, "domainSearchPerUser"))
    return { error: "domains.errors.rateLimited", query: query.data };
  try {
    return { ok: true, query: query.data, offers: await purchase.searchDomains(user.id, query.data) };
  } catch (error) {
    if (error instanceof DomainError) return { error: `domains.errors.${error.code}`, query: query.data };
    throw error;
  }
}

const text = (max: number) => z.string().trim().min(1).max(max);
const registrantSchema = z
  .object({
    type: z.enum(["PERSON", "COMPANY"]),
    firstName: text(60),
    lastName: text(60),
    companyName: z.string().trim().max(200),
    taxId: z.string().trim().max(20),
    email: z.email().max(200),
    phoneCountryCode: z
      .string()
      .trim()
      .regex(/^\+\d{1,3}$/),
    phoneNumber: z
      .string()
      .transform((value) => value.replace(/[\s.-]/g, ""))
      .pipe(z.string().regex(/^\d{6,14}$/)),
    street: text(200),
    postalCode: text(16),
    city: text(100),
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/),
  })
  .refine((r) => r.type === "PERSON" || r.companyName.length > 0, { path: ["companyName"] });

export async function startDomainPurchaseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser("/dashboard");
  const values = formValues(formData);
  const siteId = id.safeParse(values.siteId);
  const domain = z.string().trim().toLowerCase().max(253).safeParse(values.domain);
  const registrant = registrantSchema.safeParse({ companyName: "", taxId: "", ...values });
  if (!siteId.success || !domain.success || !registrant.success)
    return { error: "domains.errors.registrantInvalid", values };
  if (await limited(user.id, "checkoutPerUser")) return { error: "domains.errors.rateLimited", values };

  const r = registrant.data;
  let url: string;
  try {
    url = await purchase.startDomainPurchase(user.id, {
      siteId: siteId.data,
      domain: domain.data,
      registrant: {
        type: r.type,
        firstName: r.firstName,
        lastName: r.lastName,
        companyName: r.type === "COMPANY" ? r.companyName : null,
        taxId: r.type === "COMPANY" && r.taxId ? r.taxId : null,
        email: r.email,
        phone: { countryCode: r.phoneCountryCode, number: r.phoneNumber },
        street: r.street,
        postalCode: r.postalCode,
        city: r.city,
        country: r.country.toUpperCase(),
      },
    });
  } catch (error) {
    if (error instanceof DomainError) return { error: `domains.errors.${error.code}`, values };
    throw error;
  }
  redirect(url);
}

export async function setDomainAutoRenewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/dashboard");
  const orderId = id.safeParse(formData.get("orderId"));
  if (!orderId.success) return { error: "domains.errors.notFound" };
  return run(() => purchase.setDomainAutoRenew(user.id, orderId.data, formData.get("autoRenew") === "1"));
}

export async function showAuthCodeAction(_prev: AuthCodeState, formData: FormData): Promise<AuthCodeState> {
  const user = await requireUser("/dashboard");
  const orderId = id.safeParse(formData.get("orderId"));
  if (!orderId.success) return { error: "domains.errors.notFound" };
  if (await limited(user.id, "domainAuthCodePerUser")) return { error: "domains.errors.rateLimited" };
  try {
    return { ok: true, code: await purchase.getDomainAuthCode(user.id, orderId.data) };
  } catch (error) {
    if (error instanceof DomainError) return { error: `domains.errors.${error.code}` };
    throw error;
  }
}

// --- Staff (not owner-scoped) --------------------------------------------------------------

/** Staff: verify a domain now (any client). */
export async function adminCheckDomainAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(STAFF_ROLES);
  const domainId = id.safeParse(formData.get("domainId"));
  if (!domainId.success) return { error: "domains.errors.notFound" };
  const domain = await db.domain.findUnique({ where: { id: domainId.data } });
  if (!domain?.providerHostnameId) return { error: "domains.errors.notFound" };
  try {
    await applyHostnameState(
      domain,
      await getHostnameProvider(getEnv()).refresh(domain.providerHostnameId),
      nextDomainDeps(),
    );
  } catch (error) {
    console.error("[domains] admin check failed", error);
    return { error: "domains.errors.providerError" };
  }
  refresh();
  return { ok: true };
}

/** Admin: put a failed registration back into the queue. */
export async function retryDomainOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole([Role.ADMIN]);
  const orderId = id.safeParse(formData.get("orderId"));
  if (!orderId.success) return { error: "domains.errors.notFound" };
  const order = await db.domainOrder.findUnique({ where: { id: orderId.data } });
  if (order?.status !== DomainOrderStatus.FAILED) return { error: "domains.errors.orderNotActive" };
  const updated = await db.domainOrder.update({
    where: { id: order.id },
    data: { status: DomainOrderStatus.REGISTERING, attempts: 0, lastError: null },
  });
  await enqueueDomainJob({ name: "register", orderId: order.id }, String(updated.updatedAt.getTime()));
  refresh();
  return { ok: true };
}

const settingsForm = z.object({
  tlds: z.string().transform((value) =>
    value
      .split(/[\s,]+/)
      .map((tld) => tld.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean),
  ),
  markupPercent: z.coerce.number(),
  minMarkup: z
    .string()
    .transform((value) => Math.round(Number(value.replace(",", ".")) * 100))
    .pipe(z.number().int()),
  eurRate: z.coerce.number(),
  usdRate: z.coerce.number(),
  maxHostnamesPerSite: z.coerce.number().int(),
});

export async function saveDomainSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole([Role.ADMIN]);
  const values = formValues(formData);
  const form = settingsForm.safeParse(values);
  if (!form.success) return { error: "adminSettings.errors.invalid", values };
  const parsed = domainSettingsSchema.safeParse({
    tlds: form.data.tlds,
    markupPercent: form.data.markupPercent,
    minMarkup: form.data.minMarkup,
    exchangeRates: { EUR: form.data.eurRate, USD: form.data.usdRate },
    maxHostnamesPerSite: form.data.maxHostnamesPerSite,
  });
  if (!parsed.success) return { error: "adminSettings.errors.invalid", values };
  await saveDomainSettings(parsed.data);
  refresh();
  return { ok: true, values };
}
