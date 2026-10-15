import { randomBytes } from "node:crypto";

import { BillingInterval, SubscriptionStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getEnv, platformUrl } from "@/lib/env";
import { createSignedToken, verifySignedToken } from "@/lib/signed-token";

import {
  PaymentProviderError,
  type BillingEvent,
  type CheckoutResult,
  type PaymentCheckoutInput,
  type PaymentProvider,
  type ProviderSubscription,
  type SubscriptionCheckoutInput,
} from "./types";

/**
 * Mock payment provider: checkout and customer portal are local pages (/billing/mock-*); "paying"
 * produces the same normalized events Stripe webhooks would, handled by the same code path.
 */

const TOKEN_PURPOSE = "mock-checkout";
const id = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;
const eventId = () => id("mock_evt");

export type MockCheckoutToken =
  | ({ kind: "subscription"; sessionId: string } & SubscriptionCheckoutInput)
  | ({ kind: "payment"; sessionId: string } & PaymentCheckoutInput)
  | ({ kind: "domain"; sessionId: string } & PaymentCheckoutInput);

type Emit = (event: BillingEvent) => Promise<void>;

function addInterval(date: Date, interval: BillingInterval | undefined): Date {
  const next = new Date(date);
  if (interval === BillingInterval.YEAR) next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

async function currentSubscription(subscriptionId: string): Promise<ProviderSubscription> {
  const sub = await db.subscription.findUnique({
    where: { providerSubscriptionId: subscriptionId },
    include: { user: { select: { billingCustomerId: true } } },
  });
  if (!sub) {
    // Domain renewals are subscriptions too (tracked on the domain order).
    const order = await db.domainOrder.findUnique({
      where: { providerSubscriptionId: subscriptionId },
      include: { user: { select: { billingCustomerId: true } } },
    });
    if (!order)
      throw new PaymentProviderError("providerError", `Unknown mock subscription ${subscriptionId}`);
    return {
      id: subscriptionId,
      customerId: order.user.billingCustomerId ?? "",
      status: SubscriptionStatus.ACTIVE,
      priceRef: null,
      cancelAtPeriodEnd: !order.autoRenew,
      currentPeriodEnd: order.expiresAt,
      trialEnd: null,
      metadata: { kind: "domain", userId: order.userId, orderId: order.id },
    };
  }
  return {
    id: subscriptionId,
    customerId: sub.user.billingCustomerId ?? "",
    status: sub.status,
    priceRef: sub.priceId,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    currentPeriodEnd: sub.currentPeriodEnd,
    trialEnd: sub.trialEndsAt,
    metadata: { userId: sub.userId, planId: sub.planId, priceId: sub.priceId ?? "" },
  };
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  constructor(private readonly emit: Emit) {}

  async ensureCustomer(user: { id: string }, existingId: string | null) {
    return existingId ?? `mock_cus_${user.id}`;
  }

  private checkout(payload: MockCheckoutToken): CheckoutResult {
    const token = createSignedToken(payload, getEnv().AUTH_SECRET, TOKEN_PURPOSE, 60 * 60);
    return { url: platformUrl("app", `/billing/mock-checkout?token=${token}`), sessionId: payload.sessionId };
  }

  async createSubscriptionCheckout(input: SubscriptionCheckoutInput) {
    return this.checkout({ kind: "subscription", sessionId: id("mock_cs"), ...input });
  }

  async createPaymentCheckout(input: PaymentCheckoutInput) {
    return this.checkout({ kind: "payment", sessionId: id("mock_cs"), ...input });
  }

  async createDomainCheckout(input: PaymentCheckoutInput) {
    return this.checkout({ kind: "domain", sessionId: id("mock_cs"), ...input });
  }

  async createPortalSession(input: { returnUrl: string }) {
    return { url: platformUrl("app", `/billing/mock-portal?return=${encodeURIComponent(input.returnUrl)}`) };
  }

  async changeSubscriptionPrice(input: {
    subscriptionId: string;
    priceRef: string;
    metadata: Record<string, string>;
  }) {
    const subscription = await currentSubscription(input.subscriptionId);
    await this.emit({
      id: eventId(),
      type: "subscription.updated",
      subscription: {
        ...subscription,
        priceRef: input.priceRef,
        metadata: { ...subscription.metadata, ...input.metadata },
      },
    });
  }

  async setCancelAtPeriodEnd(input: { subscriptionId: string; cancel: boolean }) {
    const subscription = await currentSubscription(input.subscriptionId);
    await this.emit({
      id: eventId(),
      type: "subscription.updated",
      subscription: { ...subscription, cancelAtPeriodEnd: input.cancel },
    });
  }

  async cancelSubscription(input: { subscriptionId: string }) {
    await this.simulateEnd(input.subscriptionId);
  }

  async refund(input: { paymentRef: string; amount: number }) {
    await this.simulateRefund(input.paymentRef, input.amount);
  }

  priceRef(price: { id: string }) {
    return price.id;
  }

  async syncPrice() {
    return id("mock_price");
  }

  async syncCoupon() {
    return { couponId: id("mock_coupon"), promotionCodeId: id("mock_promo") };
  }

  async deactivateCoupon() {}

  async parseWebhook(): Promise<BillingEvent | null> {
    // The mock provider delivers events in-process; there is no webhook endpoint for it.
    throw new PaymentProviderError("invalidSignature");
  }

  // --- Mock-only operations (used by the mock checkout/portal pages) -------------------------

  static readToken(token: string): MockCheckoutToken | null {
    return verifySignedToken<MockCheckoutToken>(token, getEnv().AUTH_SECRET, TOKEN_PURPOSE);
  }

  /** Simulates a successful checkout: emits what Stripe would send for it. */
  async completeCheckout(token: MockCheckoutToken): Promise<void> {
    if (token.kind === "payment") {
      await this.emit({
        id: eventId(),
        type: "checkout.completed",
        sessionId: token.sessionId,
        mode: "payment",
        customerId: token.customerId,
        subscriptionId: null,
        amountTotal: token.amount,
        currency: token.currency,
        paymentRef: id("mock_pi"),
        metadata: token.metadata,
      });
      return;
    }

    if (token.kind === "domain") return this.completeDomainCheckout(token);

    const price = await db.planPrice.findUnique({ where: { id: token.priceRef }, include: { plan: true } });
    if (!price) throw new PaymentProviderError("providerError", "Unknown price");
    const now = new Date();
    const trialEnd = token.trialDays > 0 ? new Date(now.getTime() + token.trialDays * 86_400_000) : null;
    const subscription: ProviderSubscription = {
      id: id("mock_sub"),
      customerId: token.customerId,
      status: trialEnd ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
      priceRef: price.id,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: trialEnd ?? addInterval(now, price.interval),
      trialEnd,
      metadata: token.metadata,
    };
    await this.emit({
      id: eventId(),
      type: "checkout.completed",
      sessionId: token.sessionId,
      mode: "subscription",
      customerId: token.customerId,
      subscriptionId: subscription.id,
      amountTotal: trialEnd ? 0 : price.amount,
      currency: price.currency,
      paymentRef: null,
      metadata: token.metadata,
    });
    await this.emit({ id: eventId(), type: "subscription.updated", subscription });
    if (!trialEnd) {
      await this.emit({
        id: eventId(),
        type: "invoice.paid",
        invoice: {
          id: id("mock_in"),
          customerId: token.customerId,
          subscriptionId: subscription.id,
          amountPaid: price.amount,
          amountDue: price.amount,
          currency: price.currency,
          description: `${price.plan.name} (${price.interval === BillingInterval.YEAR ? "12" : "1"} mies.)`,
          paymentRef: id("mock_pi"),
          subscriptionMetadata: token.metadata,
        },
      });
    }
  }

  private async completeDomainCheckout(token: Extract<MockCheckoutToken, { kind: "domain" }>) {
    const subscription: ProviderSubscription = {
      id: id("mock_sub"),
      customerId: token.customerId,
      status: SubscriptionStatus.ACTIVE,
      priceRef: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: addInterval(new Date(), BillingInterval.YEAR),
      trialEnd: null,
      metadata: token.metadata,
    };
    await this.emit({
      id: eventId(),
      type: "checkout.completed",
      sessionId: token.sessionId,
      mode: "subscription",
      customerId: token.customerId,
      subscriptionId: subscription.id,
      amountTotal: token.amount,
      currency: token.currency,
      paymentRef: null,
      metadata: token.metadata,
    });
    await this.emit({ id: eventId(), type: "subscription.updated", subscription });
    await this.emit({
      id: eventId(),
      type: "invoice.paid",
      invoice: {
        id: id("mock_in"),
        customerId: token.customerId,
        subscriptionId: subscription.id,
        amountPaid: token.amount,
        amountDue: token.amount,
        currency: token.currency,
        description: token.name,
        paymentRef: id("mock_pi"),
        subscriptionMetadata: token.metadata,
      },
    });
  }

  /** What a renewal of the subscription charges: its plan price, or the domain order's yearly price. */
  private async renewalCharge(subscription: ProviderSubscription) {
    if (subscription.metadata.kind === "domain") {
      const order = await db.domainOrder.findUnique({ where: { id: subscription.metadata.orderId ?? "" } });
      if (!order) throw new PaymentProviderError("providerError", "Unknown domain order");
      return {
        amount: order.priceAmount,
        currency: order.currency,
        description: `Domena ${order.domainName} (1 rok)`,
        interval: BillingInterval.YEAR,
      };
    }
    const price = subscription.priceRef
      ? await db.planPrice.findUnique({ where: { id: subscription.priceRef }, include: { plan: true } })
      : null;
    if (!price) throw new PaymentProviderError("providerError", "Subscription has no price");
    return {
      amount: price.amount,
      currency: price.currency,
      description: `${price.plan.name} (${price.interval === BillingInterval.YEAR ? "12" : "1"} mies.)`,
      interval: price.interval,
    };
  }

  /** Simulates a renewal charge for the subscription: paid (new period) or failed (past due). */
  async simulateRenewal(subscriptionId: string, success: boolean): Promise<void> {
    const subscription = await currentSubscription(subscriptionId);
    const price = await this.renewalCharge(subscription);
    const invoice = {
      id: id("mock_in"),
      customerId: subscription.customerId,
      subscriptionId,
      amountPaid: success ? price.amount : 0,
      amountDue: price.amount,
      currency: price.currency,
      description: price.description,
      paymentRef: success ? id("mock_pi") : null,
      subscriptionMetadata: subscription.metadata,
    };
    if (success) {
      await this.emit({ id: eventId(), type: "invoice.paid", invoice });
      await this.emit({
        id: eventId(),
        type: "subscription.updated",
        subscription: {
          ...subscription,
          status: SubscriptionStatus.ACTIVE,
          trialEnd: null,
          currentPeriodEnd: addInterval(subscription.currentPeriodEnd ?? new Date(), price.interval),
        },
      });
    } else {
      await this.emit({ id: eventId(), type: "invoice.payment_failed", invoice });
      await this.emit({
        id: eventId(),
        type: "subscription.updated",
        subscription: { ...subscription, status: SubscriptionStatus.PAST_DUE },
      });
    }
  }

  /** Simulates a refund (in the provider's dashboard) of a paid charge; `amount` defaults to the rest. */
  async simulateRefund(paymentRef: string, amount?: number): Promise<void> {
    const payment = await db.payment.findUnique({ where: { providerChargeRef: paymentRef } });
    if (!payment) throw new PaymentProviderError("providerError", `Unknown mock charge ${paymentRef}`);
    const refund = Math.min(
      amount ?? payment.amount - payment.refundedAmount,
      payment.amount - payment.refundedAmount,
    );
    await this.emit({
      id: eventId(),
      type: "payment.refunded",
      paymentRef,
      amountRefunded: payment.refundedAmount + refund,
      currency: payment.currency,
    });
  }

  /** Simulates the end of the subscription (e.g. cancel at period end reached, or dunning exhausted). */
  async simulateEnd(subscriptionId: string): Promise<void> {
    const subscription = await currentSubscription(subscriptionId);
    await this.emit({
      id: eventId(),
      type: "subscription.deleted",
      subscription: { ...subscription, status: SubscriptionStatus.CANCELED },
    });
  }
}
