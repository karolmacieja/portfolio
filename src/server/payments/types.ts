import type { BillingInterval, CouponDuration, SubscriptionStatus } from "@/generated/prisma/enums";

/**
 * Payment provider adapter (Stripe in production, mock for development/tests). Providers report
 * changes as normalized `BillingEvent`s which src/server/billing/events.ts applies to the database;
 * the app never reads Stripe objects directly.
 */

export type ProviderSubscription = {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  /** Provider price reference (Stripe price id; the internal PlanPrice id for the mock provider). */
  priceRef: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  metadata: Record<string, string>;
  /** Units of the subscription item (seats of a group license); 1 for plans. */
  quantity?: number;
};

export type ProviderInvoice = {
  id: string;
  customerId: string | null;
  subscriptionId: string | null;
  /** Gross amounts in the smallest currency unit. */
  amountPaid: number;
  amountDue: number;
  currency: string;
  description: string;
  /** Charge reference (Stripe PaymentIntent) used to match refunds; null when unknown. */
  paymentRef: string | null;
  /** Metadata of the invoice's subscription (kind "domain" marks domain renewals). */
  subscriptionMetadata: Record<string, string>;
};

export type BillingEvent =
  | {
      id: string;
      type: "checkout.completed";
      sessionId: string;
      mode: "subscription" | "payment";
      customerId: string | null;
      subscriptionId: string | null;
      amountTotal: number | null;
      currency: string | null;
      /** Charge reference of one-time payments (Stripe PaymentIntent). */
      paymentRef: string | null;
      metadata: Record<string, string>;
    }
  | { id: string; type: "subscription.updated" | "subscription.deleted"; subscription: ProviderSubscription }
  | { id: string; type: "invoice.paid" | "invoice.payment_failed"; invoice: ProviderInvoice }
  | {
      id: string;
      type: "payment.refunded";
      paymentRef: string;
      /** Total refunded so far for the charge (cumulative, smallest currency unit). */
      amountRefunded: number;
      currency: string;
    };

export type CheckoutResult = { url: string; sessionId: string };

export type SubscriptionCheckoutInput = {
  customerId: string;
  priceRef: string;
  trialDays: number;
  promotionCodeRef: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Copied to the checkout session and the subscription (userId, planId, priceId, couponCode). */
  metadata: Record<string, string>;
};

export type PaymentCheckoutInput = {
  customerId: string;
  amount: number;
  currency: string;
  name: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
};

/** Yearly subscription for a purchased domain, priced inline (gross, renews automatically). */
export type DomainCheckoutInput = PaymentCheckoutInput;

/**
 * A subscription priced inline (no catalog price): `amount` is the gross unit price per `interval`,
 * charged `quantity` times (group license seats; 1 for add-ons).
 */
export type InlineSubscriptionCheckoutInput = PaymentCheckoutInput & {
  interval: BillingInterval;
  quantity: number;
};

export type PriceSyncInput = {
  planId: string;
  planName: string;
  interval: BillingInterval;
  amount: number;
  currency: string;
};

export type CouponSyncInput = {
  code: string;
  name: string;
  percentOff: number | null;
  amountOff: number | null;
  duration: CouponDuration;
  durationInMonths: number | null;
  maxRedemptions: number | null;
  expiresAt: Date | null;
};

export interface PaymentProvider {
  readonly name: "stripe" | "mock";
  ensureCustomer(
    user: { id: string; email: string; name: string | null },
    existingId: string | null,
  ): Promise<string>;
  createSubscriptionCheckout(input: SubscriptionCheckoutInput): Promise<CheckoutResult>;
  createPaymentCheckout(input: PaymentCheckoutInput): Promise<CheckoutResult>;
  createDomainCheckout(input: DomainCheckoutInput): Promise<CheckoutResult>;
  createInlineSubscriptionCheckout(input: InlineSubscriptionCheckoutInput): Promise<CheckoutResult>;
  /** Changes the units of a subscription (license seats), prorated by the provider. */
  setSubscriptionQuantity(input: { subscriptionId: string; quantity: number }): Promise<void>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  /** Switches the plan price immediately with proration. */
  changeSubscriptionPrice(input: {
    subscriptionId: string;
    priceRef: string;
    metadata: Record<string, string>;
  }): Promise<void>;
  setCancelAtPeriodEnd(input: { subscriptionId: string; cancel: boolean }): Promise<void>;
  /** Ends a subscription right away, without proration or refund (account erasure). */
  cancelSubscription(input: { subscriptionId: string }): Promise<void>;
  /** Refunds (part of) a charge; the provider then reports it as a payment.refunded event. */
  refund(input: { paymentRef: string; amount: number }): Promise<void>;
  /** Price reference for a plan price (null when the price isn't synced to the provider yet). */
  priceRef(price: { id: string; stripePriceId: string | null }): string | null;
  syncPrice(input: PriceSyncInput): Promise<string>;
  syncCoupon(input: CouponSyncInput): Promise<{ couponId: string; promotionCodeId: string }>;
  deactivateCoupon(input: { promotionCodeId: string }): Promise<void>;
  /** Verifies the webhook signature and normalizes the event; null for event types we don't handle. */
  parseWebhook(rawBody: string, signature: string | null): Promise<BillingEvent | null>;
}

export class PaymentProviderError extends Error {
  constructor(
    readonly code: "invalidSignature" | "priceNotSynced" | "providerError",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "PaymentProviderError";
  }
}
