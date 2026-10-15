import { isLocale } from "@/i18n/config";
import { Prisma, PaymentKind, PaymentStatus, SubscriptionStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ENTITLED_STATUSES } from "@/server/entitlements/rules";
import { buildLinkMail } from "@/server/mail/templates";
import { queueCorrectionForRefund, queueInvoiceForPayment } from "@/server/invoicing/service";
import type { BillingEvent, ProviderInvoice, ProviderSubscription } from "@/server/payments/types";

import type { BillingDeps } from "./deps";
import { allSiteTags, restoreSitesAfterPayment, suspendSitesForPayment } from "./sites";
import { billingSnapshot } from "./snapshot";
import * as domainBilling from "@/server/domains/billing";
import { sendDomainMail } from "@/server/domains/status";

/** Creates the invoice row for a paid payment and hands it to the worker. */
async function invoicePayment(paymentId: string, deps: BillingDeps) {
  const invoiceId = await queueInvoiceForPayment(paymentId);
  if (invoiceId) await deps.enqueueInvoice(invoiceId);
}

/**
 * Applies normalized payment provider events to the database. Idempotent: each event id is recorded
 * in WebhookEvent before processing (and removed again if processing fails, so the provider's retry
 * works). Events may arrive in any order (Stripe sends subscription.created before
 * checkout.session.completed), so every handler resolves its own context.
 */

type Mail = "paymentFailed" | "sitesSuspended" | "subscriptionEnded";

async function sendMail(deps: BillingDeps, userId: string, kind: Mail) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, locale: true } });
  if (!user) return;
  try {
    const mail = await buildLinkMail({
      kind,
      to: user.email,
      url: deps.billingUrl,
      locale: isLocale(user.locale) ? user.locale : "pl",
      brand: deps.brand,
    });
    await deps.mailer.send(mail);
  } catch (error) {
    console.error(`Failed to send ${kind} mail`, error);
  }
}

async function resolveUserId(
  customerId: string | null,
  metadata: Record<string, string>,
): Promise<string | null> {
  if (metadata.userId && (await db.user.count({ where: { id: metadata.userId } }))) return metadata.userId;
  if (!customerId) return null;
  const user = await db.user.findUnique({ where: { billingCustomerId: customerId }, select: { id: true } });
  return user?.id ?? null;
}

async function resolvePrice(priceRef: string | null) {
  if (!priceRef) return null;
  return db.planPrice.findFirst({ where: { OR: [{ id: priceRef }, { stripePriceId: priceRef }] } });
}

async function onCheckoutCompleted(
  event: Extract<BillingEvent, { type: "checkout.completed" }>,
  deps: BillingDeps,
) {
  const userId = await resolveUserId(event.customerId, event.metadata);
  if (!userId) throw new Error(`Checkout ${event.sessionId}: unknown user`);
  if (event.customerId) {
    await db.user.updateMany({
      where: { id: userId, billingCustomerId: null },
      data: { billingCustomerId: event.customerId },
    });
  }
  if (domainBilling.isDomainMetadata(event.metadata)) {
    await domainBilling.onDomainCheckoutCompleted(event.subscriptionId, event.metadata);
    return;
  }
  if (event.metadata.couponCode) {
    await db.coupon.updateMany({
      where: { code: event.metadata.couponCode },
      data: { timesRedeemed: { increment: 1 } },
    });
  }

  if (event.mode === "payment" && event.metadata.kind === "template" && event.metadata.templateId) {
    const templateId = event.metadata.templateId;
    const template = await db.template.findUnique({ where: { id: templateId }, select: { name: true } });
    await db.templatePurchase.upsert({
      where: { templateId_userId: { templateId, userId } },
      update: {},
      create: {
        templateId,
        userId,
        amount: event.amountTotal ?? 0,
        currency: event.currency ?? "PLN",
        providerSessionId: event.sessionId,
      },
    });
    const payment = await db.payment.upsert({
      where: { providerPaymentId: event.sessionId },
      update: {},
      create: {
        userId,
        kind: PaymentKind.TEMPLATE,
        status: PaymentStatus.PAID,
        amount: event.amountTotal ?? 0,
        currency: event.currency ?? "PLN",
        providerPaymentId: event.sessionId,
        providerChargeRef: event.paymentRef,
        description: `Szablon: ${template?.name ?? templateId}`,
        billingSnapshot: await billingSnapshot(userId),
        paidAt: deps.now?.() ?? new Date(),
      },
    });
    await invoicePayment(payment.id, deps);
  }
}

async function onSubscriptionChanged(
  subscription: ProviderSubscription,
  deleted: boolean,
  deps: BillingDeps,
) {
  const userId = await resolveUserId(subscription.customerId, subscription.metadata);
  if (!userId) throw new Error(`Subscription ${subscription.id}: unknown user`);
  const price = await resolvePrice(subscription.priceRef);
  const planId = price?.planId ?? subscription.metadata.planId;
  if (!planId) throw new Error(`Subscription ${subscription.id}: unknown plan`);

  const status = deleted ? SubscriptionStatus.CANCELED : subscription.status;
  const now = deps.now?.() ?? new Date();
  const healthy = status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING;
  const data = {
    userId,
    planId,
    priceId: price?.id ?? null,
    status,
    trialEndsAt: subscription.trialEnd,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    canceledAt: deleted ? now : null,
    ...(healthy ? { pastDueSince: null, dunningStage: 0 } : {}),
  };
  const saved = await db.subscription.upsert({
    where: { providerSubscriptionId: subscription.id },
    update: data,
    create: { ...data, providerSubscriptionId: subscription.id },
  });
  if (status === SubscriptionStatus.PAST_DUE && !saved.pastDueSince) {
    await db.subscription.update({ where: { id: saved.id }, data: { pastDueSince: now } });
  }

  const tags = await allSiteTags(userId);
  if (ENTITLED_STATUSES.includes(status)) {
    // A user has one plan at a time: older subscriptions (e.g. granted manually) end here.
    await db.subscription.updateMany({
      where: { userId, id: { not: saved.id }, status: { in: [...ENTITLED_STATUSES] } },
      data: { status: SubscriptionStatus.CANCELED, canceledAt: now },
    });
    if (healthy) tags.push(...(await restoreSitesAfterPayment(userId)));
  } else if (deleted) {
    const stillEntitled = await db.subscription.count({
      where: { userId, status: { in: [...ENTITLED_STATUSES] } },
    });
    if (stillEntitled === 0) {
      tags.push(...(await suspendSitesForPayment(userId)));
      await sendMail(deps, userId, "subscriptionEnded");
    }
  }
  // Plan changes affect public sites (branding footer, suspension).
  await deps.invalidate(tags);
}

async function findSubscriptionForInvoice(invoice: ProviderInvoice) {
  if (!invoice.subscriptionId) return null;
  return db.subscription.findUnique({ where: { providerSubscriptionId: invoice.subscriptionId } });
}

async function onInvoicePaid(invoice: ProviderInvoice, deps: BillingDeps) {
  const subscription = await findSubscriptionForInvoice(invoice);
  const userId = subscription?.userId ?? (await resolveUserId(invoice.customerId, {}));
  if (!userId) throw new Error(`Invoice ${invoice.id}: unknown user`);
  const now = deps.now?.() ?? new Date();

  // Zero-amount invoices (trial start, 100% coupons) are not payments.
  if (invoice.amountPaid > 0) {
    const data = {
      status: PaymentStatus.PAID,
      amount: invoice.amountPaid,
      currency: invoice.currency,
      description: invoice.description,
      paidAt: now,
      billingSnapshot: await billingSnapshot(userId),
      ...(invoice.paymentRef ? { providerChargeRef: invoice.paymentRef } : {}),
    };
    const payment = await db.payment.upsert({
      where: { providerPaymentId: invoice.id },
      update: data,
      create: {
        ...data,
        userId,
        subscriptionId: subscription?.id,
        kind: PaymentKind.SUBSCRIPTION,
        providerPaymentId: invoice.id,
      },
    });
    await invoicePayment(payment.id, deps);
  }
  if (subscription) {
    await db.subscription.update({
      where: { id: subscription.id },
      data: { pastDueSince: null, dunningStage: 0 },
    });
  }
  await deps.invalidate(await restoreSitesAfterPayment(userId));
}

async function onInvoiceFailed(invoice: ProviderInvoice, deps: BillingDeps) {
  const subscription = await findSubscriptionForInvoice(invoice);
  const userId = subscription?.userId ?? (await resolveUserId(invoice.customerId, {}));
  if (!userId) throw new Error(`Invoice ${invoice.id}: unknown user`);

  const existing = await db.payment.findUnique({ where: { providerPaymentId: invoice.id } });
  if (!existing) {
    await db.payment.create({
      data: {
        userId,
        subscriptionId: subscription?.id,
        kind: PaymentKind.SUBSCRIPTION,
        status: PaymentStatus.FAILED,
        amount: invoice.amountDue,
        currency: invoice.currency,
        providerPaymentId: invoice.id,
        description: invoice.description,
      },
    });
  }
  if (!subscription) return;
  // First failure of a past-due period: start dunning (day-0 notice; reminders/suspension by the worker).
  if (!subscription.pastDueSince) {
    await db.subscription.update({
      where: { id: subscription.id },
      data: { pastDueSince: deps.now?.() ?? new Date(), dunningStage: 1 },
    });
    await sendMail(deps, userId, "paymentFailed");
  }
}

/** Refunds (made in the provider's dashboard): record the refunded total and issue a correction. */
async function onPaymentRefunded(
  event: Extract<BillingEvent, { type: "payment.refunded" }>,
  deps: BillingDeps,
) {
  const payment = await db.payment.findUnique({ where: { providerChargeRef: event.paymentRef } });
  if (!payment) throw new Error(`Refund for unknown charge ${event.paymentRef}`);
  const refunded = Math.min(Math.max(event.amountRefunded, payment.refundedAmount), payment.amount);
  const fullyRefunded = refunded >= payment.amount;
  await db.payment.update({
    where: { id: payment.id },
    data: { refundedAmount: refunded, ...(fullyRefunded ? { status: PaymentStatus.REFUNDED } : {}) },
  });
  // A fully refunded template purchase no longer grants the template (sites made from it stay).
  if (fullyRefunded && payment.kind === PaymentKind.TEMPLATE) {
    await db.templatePurchase.deleteMany({ where: { providerSessionId: payment.providerPaymentId } });
  }
  const correctionId = await queueCorrectionForRefund(payment.id);
  if (correctionId) await deps.enqueueInvoice(correctionId);
}

function domainDeps(deps: BillingDeps): domainBilling.DomainBillingDeps {
  return {
    enqueueDomainJob: deps.enqueueDomainJob,
    enqueueInvoice: deps.enqueueInvoice,
    queueInvoiceForPayment,
    sendRenewalFailedMail: (userId, domain) =>
      sendDomainMail(
        { mailer: deps.mailer, brand: deps.brand, panelUrl: deps.billingUrl },
        userId,
        "domainRenewalFailed",
        {
          domain,
        },
      ),
    now: deps.now,
  };
}

export async function handleBillingEvent(
  event: BillingEvent,
  provider: string,
  deps: BillingDeps,
): Promise<{ processed: boolean }> {
  try {
    await db.webhookEvent.create({ data: { id: event.id, provider, type: event.type } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return { processed: false };
    throw error;
  }

  try {
    switch (event.type) {
      case "checkout.completed":
        await onCheckoutCompleted(event, deps);
        break;
      case "subscription.updated":
      case "subscription.deleted":
        if (domainBilling.isDomainMetadata(event.subscription.metadata)) {
          await domainBilling.onDomainSubscriptionChanged(
            event.subscription,
            event.type === "subscription.deleted",
          );
        } else {
          await onSubscriptionChanged(event.subscription, event.type === "subscription.deleted", deps);
        }
        break;
      case "invoice.paid":
        if (await domainBilling.isDomainInvoice(event.invoice)) {
          await domainBilling.onDomainInvoicePaid(event.invoice, domainDeps(deps));
        } else {
          await onInvoicePaid(event.invoice, deps);
        }
        break;
      case "invoice.payment_failed":
        if (await domainBilling.isDomainInvoice(event.invoice)) {
          await domainBilling.onDomainInvoiceFailed(event.invoice, domainDeps(deps));
        } else {
          await onInvoiceFailed(event.invoice, deps);
        }
        break;
      case "payment.refunded":
        await onPaymentRefunded(event, deps);
        break;
    }
  } catch (error) {
    // Let the provider retry the event later.
    await db.webhookEvent.delete({ where: { id: event.id } }).catch(() => undefined);
    throw error;
  }
  return { processed: true };
}
