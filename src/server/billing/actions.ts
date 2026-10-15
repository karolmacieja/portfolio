"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { BillingPartyType, CouponDuration, Role } from "@/generated/prisma/enums";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { formValues, type ActionState } from "@/server/action-state";
import { sendEmailVerification } from "@/server/auth/email-verification";
import { requireRole, requireUser } from "@/server/auth/session";
import { MockPaymentProvider } from "@/server/payments";
import { getRateLimiter, RATE_LIMITS } from "@/server/rate-limit/limiter";

import { CouponError, createCoupon, deactivateCoupon } from "./coupons";
import { BillingError } from "./errors";
import { getPaymentProvider } from "./provider";
import * as service from "./service";

/** Billing actions for the client panel (owner-scoped) and coupon management (ADMIN). */

const id = z.string().min(1).max(64);

function billingError(error: unknown, values?: Record<string, string>): ActionState {
  if (error instanceof BillingError) return { error: `billing.errors.${error.code}`, values };
  throw error;
}

async function checkoutAllowed(userId: string): Promise<boolean> {
  const { limit, windowMs } = RATE_LIMITS.checkoutPerUser;
  return (await getRateLimiter().hit(`checkout:user:${userId}`, limit, windowMs)).allowed;
}

/** Runs a provider call that returns a URL and redirects there (redirect must happen outside try). */
async function redirectTo(fn: () => Promise<string>, values?: Record<string, string>): Promise<ActionState> {
  let url: string;
  try {
    url = await fn();
  } catch (error) {
    return billingError(error, values);
  }
  redirect(url);
}

// --- Subscriptions -------------------------------------------------------------------------

const checkoutSchema = z.object({
  priceId: id,
  coupon: z
    .string()
    .trim()
    .max(40)
    .transform((value) => value || null),
});

export async function startCheckoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/plans");
  const values = formValues(formData);
  const parsed = checkoutSchema.safeParse({ priceId: values.priceId, coupon: values.coupon ?? "" });
  if (!parsed.success) return { error: "billing.errors.invalidInput", values };
  if (!(await checkoutAllowed(user.id))) return { error: "billing.errors.rateLimited", values };
  return redirectTo(
    () =>
      service.startSubscriptionCheckout(user.id, {
        priceId: parsed.data.priceId,
        couponCode: parsed.data.coupon,
      }),
    values,
  );
}

export async function changePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/plans");
  const priceId = id.safeParse(formData.get("priceId"));
  if (!priceId.success) return { error: "billing.errors.invalidInput" };
  try {
    await service.changePlan(user.id, priceId.data);
  } catch (error) {
    return billingError(error);
  }
  refresh();
  return { ok: true };
}

export async function setCancelAtPeriodEndAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser("/billing");
  try {
    await service.setCancelAtPeriodEnd(user.id, formData.get("cancel") === "1");
  } catch (error) {
    return billingError(error);
  }
  refresh();
  return { ok: true };
}

export async function openPortalAction(): Promise<ActionState> {
  const user = await requireUser("/billing");
  return redirectTo(() => service.createPortalUrl(user.id));
}

// --- Billing profile -----------------------------------------------------------------------

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const profileSchema = z.object({
  type: z.enum([BillingPartyType.PERSON, BillingPartyType.COMPANY]),
  fullName: z.string().trim().min(2).max(120),
  companyName: optional(200),
  taxId: optional(20),
  euVatId: optional(20),
  line1: z.string().trim().min(2).max(200),
  line2: optional(200),
  postalCode: z.string().trim().min(2).max(16),
  city: z.string().trim().min(2).max(100),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/),
});

export async function saveBillingProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/billing/profile");
  const values = formValues(formData);
  const parsed = profileSchema.safeParse({
    ...values,
    companyName: values.companyName ?? "",
    taxId: values.taxId ?? "",
    euVatId: values.euVatId ?? "",
    line2: values.line2 ?? "",
  });
  if (!parsed.success) return { error: "billing.errors.invalidInput", values };
  if (parsed.data.type === BillingPartyType.COMPANY && !parsed.data.companyName) {
    return { error: "billing.errors.invalidInput", values };
  }
  try {
    await service.saveBillingProfile(user.id, parsed.data);
  } catch (error) {
    return billingError(error, values);
  }
  const next =
    typeof values.next === "string" && values.next.startsWith("/") && !values.next.startsWith("//")
      ? values.next
      : null;
  if (next) redirect(next);
  refresh();
  return { ok: true, values };
}

/** Sends a fresh email verification link (purchases require a verified address). */
export async function resendVerificationAction(): Promise<ActionState> {
  const user = await requireUser("/billing");
  const { limit, windowMs } = RATE_LIMITS.verifyEmailPerUser;
  if (!(await getRateLimiter().hit(`verify-email:user:${user.id}`, limit, windowMs)).allowed) {
    return { error: "billing.errors.rateLimited" };
  }
  const record = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { email: true, locale: true, emailVerified: true },
  });
  if (!record.emailVerified)
    await sendEmailVerification(record.email, isLocale(record.locale) ? record.locale : "pl");
  return { ok: true };
}

// --- Premium templates ---------------------------------------------------------------------

export async function purchaseTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/templates");
  const templateId = id.safeParse(formData.get("templateId"));
  if (!templateId.success) return { error: "billing.errors.invalidInput" };
  if (!(await checkoutAllowed(user.id))) return { error: "billing.errors.rateLimited" };
  return redirectTo(() => service.startTemplatePurchase(user.id, templateId.data));
}

// --- Mock provider (development only) ------------------------------------------------------

function mockProvider(): MockPaymentProvider {
  const provider = getPaymentProvider();
  if (getEnv().PAYMENTS_PROVIDER !== "mock" || !(provider instanceof MockPaymentProvider)) {
    throw new Error("Mock payment actions are only available with PAYMENTS_PROVIDER=mock");
  }
  return provider;
}

export async function completeMockCheckoutAction(formData: FormData): Promise<void> {
  const user = await requireUser("/billing");
  const provider = mockProvider();
  const token = MockPaymentProvider.readToken(String(formData.get("token") ?? ""));
  // The checkout belongs to whoever started it.
  if (!token || token.metadata.userId !== user.id) redirect("/billing");
  if (formData.get("decision") !== "pay") redirect(token.cancelUrl);
  await provider.completeCheckout(token);
  redirect(token.successUrl);
}

export async function mockPortalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/billing");
  const provider = mockProvider();
  const op = formData.get("op");
  if (op === "refund") {
    // As if staff refunded the latest charge in the provider's dashboard.
    const payment = await db.payment.findFirst({
      where: { userId: user.id, status: "PAID", providerChargeRef: { startsWith: "mock_pi_" } },
      orderBy: { createdAt: "desc" },
    });
    if (!payment?.providerChargeRef) return { error: "billing.errors.notFound" };
    await provider.simulateRefund(payment.providerChargeRef);
    refresh();
    return { ok: true };
  }
  const subscription = await db.subscription.findFirst({
    where: { userId: user.id, providerSubscriptionId: { startsWith: "mock_sub_" } },
    orderBy: { createdAt: "desc" },
  });
  if (!subscription?.providerSubscriptionId) return { error: "billing.errors.noSubscription" };
  if (op === "renewOk" || op === "renewFail") {
    await provider.simulateRenewal(subscription.providerSubscriptionId, op === "renewOk");
  } else if (op === "end") {
    await provider.simulateEnd(subscription.providerSubscriptionId);
  } else {
    return { error: "billing.errors.invalidInput" };
  }
  refresh();
  return { ok: true };
}

// --- Coupons (ADMIN) -----------------------------------------------------------------------

const ADMIN_ONLY = [Role.ADMIN] as const;
const optionalInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Number(value)))
    .pipe(z.number().int().min(min).max(max).nullable());

const couponSchema = z.object({
  code: z.string().trim().min(3).max(30),
  name: z.string().trim().min(1).max(80),
  percentOff: optionalInt(1, 100),
  amountOff: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Math.round(Number(value.replace(",", ".")) * 100)))
    .pipe(z.number().int().min(1).max(10_000_00).nullable()),
  duration: z.enum([CouponDuration.ONCE, CouponDuration.REPEATING, CouponDuration.FOREVER]),
  durationInMonths: optionalInt(1, 36),
  maxRedemptions: optionalInt(1, 1_000_000),
  expiresAt: z
    .string()
    .trim()
    .transform((value) => (value ? new Date(`${value}T23:59:59`) : null))
    .refine((value) => value === null || !Number.isNaN(value.getTime())),
});

export async function createCouponAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ONLY);
  const values = formValues(formData);
  const parsed = couponSchema.safeParse({
    percentOff: "",
    amountOff: "",
    durationInMonths: "",
    maxRedemptions: "",
    expiresAt: "",
    ...values,
  });
  if (!parsed.success) return { error: "coupons.errors.invalid", values };
  if (parsed.data.duration === CouponDuration.REPEATING && !parsed.data.durationInMonths) {
    return { error: "coupons.errors.invalid", values };
  }
  try {
    await createCoupon(parsed.data);
  } catch (error) {
    if (error instanceof CouponError) return { error: `coupons.errors.${error.code}`, values };
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function deactivateCouponAction(formData: FormData): Promise<void> {
  await requireRole(ADMIN_ONLY);
  const couponId = id.parse(formData.get("couponId"));
  await deactivateCoupon(couponId);
  refresh();
}
