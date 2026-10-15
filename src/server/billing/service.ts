import "server-only";

import { BillingPartyType, SubscriptionStatus, TemplateStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getEnv, platformUrl } from "@/lib/env";
import { isValidNip, normalizeNip, parseEuVatId } from "@/lib/tax-id";
import { canUseTier, ENTITLED_STATUSES, getEntitlements } from "@/server/entitlements";

import { BillingError } from "./errors";
import { getPaymentProvider } from "./provider";
import { createTaxIdVerifier } from "./tax-verifier";

/**
 * Client billing operations (owner-scoped by userId): billing profile, checkout, plan changes,
 * cancellation, customer portal and premium template purchases. The provider reports results back
 * as events (webhooks / in-process for the mock), so these functions never write subscriptions.
 */

export type BillingProfileInput = {
  type: BillingPartyType;
  fullName: string;
  companyName: string | null;
  taxId: string | null;
  euVatId: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  country: string;
};

export async function getBillingProfile(userId: string) {
  return db.billingProfile.findUnique({ where: { userId } });
}

export async function saveBillingProfile(userId: string, input: BillingProfileInput) {
  const country = input.country.toUpperCase();
  let taxId: string | null = null;
  let euVatId: string | null = null;
  let reverseCharge = false;
  let taxIdVerifiedAt: Date | null = null;

  if (input.type === BillingPartyType.COMPANY) {
    if (country === "PL") {
      if (!input.taxId || !isValidNip(input.taxId)) throw new BillingError("taxIdInvalid");
      taxId = normalizeNip(input.taxId);
    } else if (input.euVatId) {
      const parsed = parseEuVatId(input.euVatId);
      if (!parsed || parsed.country === "PL") throw new BillingError("euVatIdInvalid");
      const verification = await createTaxIdVerifier(getEnv()).verify(parsed.country, parsed.number);
      if (verification?.valid === false) throw new BillingError("euVatIdInvalid");
      euVatId = `${parsed.country}${parsed.number}`;
      taxIdVerifiedAt = verification ? new Date() : null;
      // Intra-EU B2B supply of services: the customer accounts for VAT (needs a verified id).
      reverseCharge = verification?.valid === true;
    }
  }

  const data = {
    type: input.type,
    fullName: input.fullName,
    companyName: input.type === BillingPartyType.COMPANY ? input.companyName : null,
    taxId,
    euVatId,
    reverseCharge,
    taxIdVerifiedAt,
    line1: input.line1,
    line2: input.line2,
    postalCode: input.postalCode,
    city: input.city,
    country,
  };
  return db.billingProfile.upsert({ where: { userId }, update: data, create: { ...data, userId } });
}

async function purchaser(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new BillingError("notFound");
  if (!user.emailVerified) throw new BillingError("emailNotVerified");
  if (!(await db.billingProfile.count({ where: { userId } })))
    throw new BillingError("billingProfileRequired");
  const customerId = await getPaymentProvider().ensureCustomer(user, user.billingCustomerId);
  if (customerId !== user.billingCustomerId) {
    await db.user.update({ where: { id: user.id }, data: { billingCustomerId: customerId } });
  }
  return { user, customerId };
}

/** The user's subscription managed by the payment provider (not manual/seed ones). */
async function providerSubscription(userId: string) {
  return db.subscription.findFirst({
    where: { userId, providerSubscriptionId: { not: null }, status: { in: [...ENTITLED_STATUSES] } },
    orderBy: { createdAt: "desc" },
  });
}

export async function resolveCoupon(code: string) {
  const coupon = await db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  const valid =
    coupon?.isActive &&
    (!coupon.expiresAt || coupon.expiresAt > new Date()) &&
    (coupon.maxRedemptions === null || coupon.timesRedeemed < coupon.maxRedemptions) &&
    coupon.providerPromotionCodeId;
  if (!coupon || !valid) throw new BillingError("couponInvalid");
  return coupon;
}

/** Starts Stripe Checkout (or the mock checkout) for a plan price; returns the URL to redirect to. */
export async function startSubscriptionCheckout(
  userId: string,
  input: { priceId: string; couponCode: string | null },
): Promise<string> {
  const price = await db.planPrice.findFirst({
    where: { id: input.priceId, isActive: true, plan: { isActive: true } },
    include: { plan: true },
  });
  if (!price) throw new BillingError("notFound");
  if (await providerSubscription(userId)) throw new BillingError("alreadySubscribed");
  const coupon = input.couponCode ? await resolveCoupon(input.couponCode) : null;
  const { customerId } = await purchaser(userId);

  const provider = getPaymentProvider();
  const priceRef = provider.priceRef(price);
  if (!priceRef) throw new BillingError("priceNotSynced");
  // One trial per customer.
  const hadSubscription = await db.subscription.count({
    where: { userId, providerSubscriptionId: { not: null } },
  });

  const checkout = await provider.createSubscriptionCheckout({
    customerId,
    priceRef,
    trialDays: hadSubscription ? 0 : price.plan.trialDays,
    promotionCodeRef: coupon?.providerPromotionCodeId ?? null,
    successUrl: platformUrl("app", "/billing/success"),
    cancelUrl: platformUrl("app", "/plans"),
    metadata: {
      userId,
      planId: price.planId,
      priceId: price.id,
      ...(coupon ? { couponCode: coupon.code } : {}),
    },
  });
  return checkout.url;
}

/** Upgrade/downgrade of an existing subscription (immediate, prorated by the provider). */
export async function changePlan(userId: string, priceId: string): Promise<void> {
  const subscription = await providerSubscription(userId);
  if (!subscription?.providerSubscriptionId) throw new BillingError("noSubscription");
  const price = await db.planPrice.findFirst({
    where: { id: priceId, isActive: true, plan: { isActive: true } },
  });
  if (!price) throw new BillingError("notFound");
  const provider = getPaymentProvider();
  const priceRef = provider.priceRef(price);
  if (!priceRef) throw new BillingError("priceNotSynced");
  await provider.changeSubscriptionPrice({
    subscriptionId: subscription.providerSubscriptionId,
    priceRef,
    metadata: { userId, planId: price.planId, priceId: price.id },
  });
}

export async function setCancelAtPeriodEnd(userId: string, cancel: boolean): Promise<void> {
  const subscription = await providerSubscription(userId);
  if (!subscription?.providerSubscriptionId) throw new BillingError("noSubscription");
  await getPaymentProvider().setCancelAtPeriodEnd({
    subscriptionId: subscription.providerSubscriptionId,
    cancel,
  });
}

export async function createPortalUrl(userId: string): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { billingCustomerId: true } });
  if (!user?.billingCustomerId) throw new BillingError("noSubscription");
  const session = await getPaymentProvider().createPortalSession({
    customerId: user.billingCustomerId,
    returnUrl: platformUrl("app", "/billing"),
  });
  return session.url;
}

/** One-time Checkout for a premium template; access is granted by the checkout.completed event. */
export async function startTemplatePurchase(userId: string, templateId: string): Promise<string> {
  const template = await db.template.findFirst({
    where: { id: templateId, status: TemplateStatus.PUBLISHED },
  });
  if (!template) throw new BillingError("notFound");
  if (!template.isPremium || !template.priceAmount) throw new BillingError("notPremium");
  if (await db.templatePurchase.count({ where: { userId, templateId } }))
    throw new BillingError("alreadyPurchased");
  if (!canUseTier(await getEntitlements(userId), template.accessTier)) throw new BillingError("planRequired");
  const { customerId } = await purchaser(userId);
  const checkout = await getPaymentProvider().createPaymentCheckout({
    customerId,
    amount: template.priceAmount,
    currency: "PLN",
    name: `Szablon „${template.name}”`,
    successUrl: platformUrl("app", "/templates?purchased=1"),
    cancelUrl: platformUrl("app", "/templates"),
    metadata: { kind: "template", userId, templateId },
  });
  return checkout.url;
}

export async function getBillingOverview(userId: string) {
  const [entitlements, subscription, payments, profile, user] = await Promise.all([
    getEntitlements(userId),
    db.subscription.findFirst({
      where: { userId, status: { notIn: [SubscriptionStatus.INCOMPLETE_EXPIRED] } },
      orderBy: { createdAt: "desc" },
      include: {
        plan: { select: { name: true } },
        price: { select: { interval: true, amount: true, currency: true } },
      },
    }),
    db.payment.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.billingProfile.findUnique({ where: { userId } }),
    db.user.findUnique({ where: { id: userId }, select: { emailVerified: true, billingCustomerId: true } }),
  ]);
  return {
    entitlements,
    subscription,
    payments,
    profile,
    emailVerified: Boolean(user?.emailVerified),
    hasCustomer: Boolean(user?.billingCustomerId),
    /** Plan changes go through the provider only for provider-managed subscriptions. */
    managedByProvider: Boolean(subscription?.providerSubscriptionId),
  };
}
