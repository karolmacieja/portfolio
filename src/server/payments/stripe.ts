import Stripe from "stripe";

import { BillingInterval, CouponDuration, SubscriptionStatus } from "@/generated/prisma/enums";

import {
  PaymentProviderError,
  type BillingEvent,
  type CheckoutResult,
  type CouponSyncInput,
  type PaymentCheckoutInput,
  type PaymentProvider,
  type PriceSyncInput,
  type ProviderInvoice,
  type ProviderSubscription,
  type SubscriptionCheckoutInput,
} from "./types";

/** Maps Stripe statuses onto ours (paused/unknown subscriptions are treated as not entitled). */
const STATUS: Record<string, SubscriptionStatus> = {
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  unpaid: SubscriptionStatus.UNPAID,
  incomplete: SubscriptionStatus.INCOMPLETE,
  incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
  canceled: SubscriptionStatus.CANCELED,
  paused: SubscriptionStatus.UNPAID,
};

const toDate = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : null);
const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : (value?.id ?? null);

/** Normalizes a Stripe subscription (API 2025+: the billing period lives on the subscription item). */
export function mapStripeSubscription(subscription: Stripe.Subscription): ProviderSubscription {
  const item = subscription.items.data[0];
  return {
    id: subscription.id,
    customerId: idOf(subscription.customer)!,
    status: STATUS[subscription.status] ?? SubscriptionStatus.UNPAID,
    priceRef: item?.price.id ?? null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || subscription.cancel_at !== null,
    currentPeriodEnd: toDate(item?.current_period_end),
    trialEnd: toDate(subscription.trial_end),
    metadata: { ...subscription.metadata },
  };
}

/** Normalizes a Stripe invoice (API 2025+: the subscription is under parent.subscription_details). */
export function mapStripeInvoice(invoice: Stripe.Invoice): ProviderInvoice {
  return {
    id: invoice.id!,
    customerId: idOf(invoice.customer),
    subscriptionId: idOf(invoice.parent?.subscription_details?.subscription),
    amountPaid: invoice.amount_paid,
    amountDue: invoice.amount_due,
    currency: invoice.currency.toUpperCase(),
    description: invoice.lines.data[0]?.description ?? invoice.number ?? "Subscription",
    paymentRef: null,
    subscriptionMetadata: { ...(invoice.parent?.subscription_details?.metadata ?? {}) },
  };
}

export function mapStripeEvent(event: Stripe.Event): BillingEvent | null {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      return {
        id: event.id,
        type: "checkout.completed",
        sessionId: session.id,
        mode: session.mode === "subscription" ? "subscription" : "payment",
        customerId: idOf(session.customer),
        subscriptionId: idOf(session.subscription),
        amountTotal: session.amount_total,
        currency: session.currency?.toUpperCase() ?? null,
        paymentRef: idOf(session.payment_intent),
        metadata: { ...(session.metadata ?? {}) },
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return {
        id: event.id,
        type: "subscription.updated",
        subscription: mapStripeSubscription(event.data.object),
      };
    case "customer.subscription.deleted":
      return {
        id: event.id,
        type: "subscription.deleted",
        subscription: mapStripeSubscription(event.data.object),
      };
    case "invoice.paid":
      return { id: event.id, type: "invoice.paid", invoice: mapStripeInvoice(event.data.object) };
    case "invoice.payment_failed":
      return { id: event.id, type: "invoice.payment_failed", invoice: mapStripeInvoice(event.data.object) };
    case "charge.refunded": {
      const charge = event.data.object;
      const paymentRef = idOf(charge.payment_intent);
      if (!paymentRef) return null;
      return {
        id: event.id,
        type: "payment.refunded",
        paymentRef,
        amountRefunded: charge.amount_refunded,
        currency: charge.currency.toUpperCase(),
      };
    }
    default:
      return null;
  }
}

const DURATION: Record<CouponDuration, Stripe.CouponCreateParams.Duration> = {
  ONCE: "once",
  REPEATING: "repeating",
  FOREVER: "forever",
};

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    /** Tests inject a fake HTTP client (Stripe.createFetchHttpClient). */
    httpClient?: Stripe.HttpClient,
  ) {
    this.stripe = new Stripe(secretKey, {
      appInfo: { name: "portfolio-saas" },
      ...(httpClient ? { httpClient } : {}),
    });
  }

  async ensureCustomer(user: { id: string; email: string; name: string | null }, existingId: string | null) {
    if (existingId) return existingId;
    const customer = await this.stripe.customers.create(
      { email: user.email, name: user.name ?? undefined, metadata: { userId: user.id } },
      { idempotencyKey: `customer-${user.id}` },
    );
    return customer.id;
  }

  async createSubscriptionCheckout(input: SubscriptionCheckoutInput): Promise<CheckoutResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: input.customerId,
      line_items: [{ price: input.priceRef, quantity: 1 }],
      subscription_data: {
        metadata: input.metadata,
        ...(input.trialDays > 0 ? { trial_period_days: input.trialDays } : {}),
      },
      ...(input.promotionCodeRef ? { discounts: [{ promotion_code: input.promotionCodeRef }] } : {}),
      metadata: input.metadata,
      client_reference_id: input.metadata.userId,
      locale: "pl",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    return { url: session.url!, sessionId: session.id };
  }

  async createPaymentCheckout(input: PaymentCheckoutInput): Promise<CheckoutResult> {
    // One-time payments: Checkout offers the methods enabled in the dashboard (card, BLIK, Przelewy24).
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      customer: input.customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amount,
            tax_behavior: "inclusive",
            product_data: { name: input.name },
          },
        },
      ],
      metadata: input.metadata,
      client_reference_id: input.metadata.userId,
      locale: "pl",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    return { url: session.url!, sessionId: session.id };
  }

  async createDomainCheckout(input: PaymentCheckoutInput): Promise<CheckoutResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: input.customerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amount,
            tax_behavior: "inclusive",
            recurring: { interval: "year" },
            product_data: { name: input.name },
          },
        },
      ],
      subscription_data: { metadata: input.metadata },
      metadata: input.metadata,
      client_reference_id: input.metadata.userId,
      locale: "pl",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    return { url: session.url!, sessionId: session.id };
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }) {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
      locale: "pl",
    });
    return { url: session.url };
  }

  async changeSubscriptionPrice(input: {
    subscriptionId: string;
    priceRef: string;
    metadata: Record<string, string>;
  }) {
    const subscription = await this.stripe.subscriptions.retrieve(input.subscriptionId);
    const item = subscription.items.data[0];
    if (!item) throw new PaymentProviderError("providerError", "Subscription has no items");
    await this.stripe.subscriptions.update(input.subscriptionId, {
      items: [{ id: item.id, price: input.priceRef }],
      proration_behavior: "create_prorations",
      metadata: input.metadata,
    });
  }

  async setCancelAtPeriodEnd(input: { subscriptionId: string; cancel: boolean }) {
    await this.stripe.subscriptions.update(input.subscriptionId, { cancel_at_period_end: input.cancel });
  }

  async cancelSubscription(input: { subscriptionId: string }) {
    try {
      await this.stripe.subscriptions.cancel(input.subscriptionId, { prorate: false, invoice_now: false });
    } catch (error) {
      // Already canceled at Stripe: nothing left to do.
      if ((error as { code?: string }).code === "resource_missing") return;
      throw error;
    }
  }

  async refund(input: { paymentRef: string; amount: number }) {
    await this.stripe.refunds.create(
      { payment_intent: input.paymentRef, amount: input.amount },
      // Same amount on the same charge twice in a row is almost certainly a double click.
      {
        idempotencyKey: `refund-${input.paymentRef}-${input.amount}-${new Date().toISOString().slice(0, 16)}`,
      },
    );
  }

  priceRef(price: { id: string; stripePriceId: string | null }) {
    return price.stripePriceId;
  }

  async syncPrice(input: PriceSyncInput): Promise<string> {
    const products = await this.stripe.products.search({ query: `metadata['planId']:'${input.planId}'` });
    const product =
      products.data[0] ??
      (await this.stripe.products.create({ name: input.planName, metadata: { planId: input.planId } }));
    const price = await this.stripe.prices.create({
      product: product.id,
      currency: input.currency.toLowerCase(),
      unit_amount: input.amount,
      tax_behavior: "inclusive",
      recurring: { interval: input.interval === BillingInterval.YEAR ? "year" : "month" },
      metadata: { planId: input.planId },
    });
    return price.id;
  }

  async syncCoupon(input: CouponSyncInput) {
    const coupon = await this.stripe.coupons.create({
      name: input.name,
      duration: DURATION[input.duration],
      ...(input.duration === CouponDuration.REPEATING && input.durationInMonths
        ? { duration_in_months: input.durationInMonths }
        : {}),
      ...(input.percentOff
        ? { percent_off: input.percentOff }
        : { amount_off: input.amountOff ?? 0, currency: "pln" }),
      ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
      ...(input.expiresAt ? { redeem_by: Math.floor(input.expiresAt.getTime() / 1000) } : {}),
    });
    const promotionCode = await this.stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: coupon.id },
      code: input.code,
    });
    return { couponId: coupon.id, promotionCodeId: promotionCode.id };
  }

  async deactivateCoupon(input: { promotionCodeId: string }) {
    await this.stripe.promotionCodes.update(input.promotionCodeId, { active: false });
  }

  async parseWebhook(rawBody: string, signature: string | null): Promise<BillingEvent | null> {
    if (!signature) throw new PaymentProviderError("invalidSignature");
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new PaymentProviderError("invalidSignature");
    }
    const mapped = mapStripeEvent(event);
    // API 2025+: invoices no longer carry the PaymentIntent; refunds are matched by it, so look it up.
    if (mapped?.type === "invoice.paid" && mapped.invoice.amountPaid > 0) {
      const payments = await this.stripe.invoicePayments.list({
        invoice: mapped.invoice.id,
        status: "paid",
        limit: 1,
      });
      mapped.invoice.paymentRef = idOf(payments.data[0]?.payment.payment_intent);
    }
    return mapped;
  }
}
