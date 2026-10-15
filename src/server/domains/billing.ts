import { DomainOrderStatus, PaymentKind, PaymentStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { billingSnapshot } from "@/server/billing/snapshot";
import type { ProviderInvoice, ProviderSubscription } from "@/server/payments/types";

/**
 * Billing events of domain subscriptions (metadata kind "domain"): they pay for a registration and
 * its yearly renewals and never touch plan subscriptions or plan dunning. Called from
 * billing/events.ts, inside its idempotency guard.
 */

export type DomainJob = { name: "register" | "renew"; orderId: string };

export type DomainBillingDeps = {
  enqueueDomainJob: (job: DomainJob) => Promise<void> | void;
  enqueueInvoice: (invoiceId: string) => Promise<void> | void;
  queueInvoiceForPayment: (paymentId: string) => Promise<string | null>;
  sendRenewalFailedMail: (userId: string, domain: string) => Promise<void>;
  now?: () => Date;
};

export const isDomainMetadata = (metadata: Record<string, string>) => metadata.kind === "domain";

async function findOrder(subscriptionId: string | null, metadata: Record<string, string>) {
  if (metadata.orderId) {
    const order = await db.domainOrder.findUnique({ where: { id: metadata.orderId } });
    if (order) return order;
  }
  return subscriptionId
    ? db.domainOrder.findUnique({ where: { providerSubscriptionId: subscriptionId } })
    : null;
}

/** Whether a provider invoice belongs to a domain subscription. */
export async function isDomainInvoice(invoice: ProviderInvoice): Promise<boolean> {
  if (isDomainMetadata(invoice.subscriptionMetadata)) return true;
  if (!invoice.subscriptionId) return false;
  return (await db.domainOrder.count({ where: { providerSubscriptionId: invoice.subscriptionId } })) > 0;
}

export async function onDomainCheckoutCompleted(
  subscriptionId: string | null,
  metadata: Record<string, string>,
) {
  const order = await findOrder(subscriptionId, metadata);
  if (!order) throw new Error(`Domain checkout: unknown order ${metadata.orderId}`);
  if (subscriptionId && !order.providerSubscriptionId) {
    await db.domainOrder.update({
      where: { id: order.id },
      data: { providerSubscriptionId: subscriptionId },
    });
  }
}

/** Auto-renewal follows the subscription: cancel at period end or deletion turns it off. */
export async function onDomainSubscriptionChanged(subscription: ProviderSubscription, deleted: boolean) {
  const order = await findOrder(subscription.id, subscription.metadata);
  if (!order) throw new Error(`Domain subscription ${subscription.id}: unknown order`);
  await db.domainOrder.update({
    where: { id: order.id },
    data: {
      providerSubscriptionId: subscription.id,
      autoRenew: !deleted && !subscription.cancelAtPeriodEnd,
    },
  });
}

/** First payment -> registration; later payments -> renewal. Each payment gets a VAT invoice. */
export async function onDomainInvoicePaid(invoice: ProviderInvoice, deps: DomainBillingDeps) {
  const order = await findOrder(invoice.subscriptionId, invoice.subscriptionMetadata);
  if (!order) throw new Error(`Domain invoice ${invoice.id}: unknown order`);
  if (invoice.amountPaid <= 0) return;

  const existing = await db.payment.findUnique({ where: { providerPaymentId: invoice.id } });
  const payment =
    existing ??
    (await db.payment.create({
      data: {
        userId: order.userId,
        domainOrderId: order.id,
        kind: PaymentKind.DOMAIN,
        status: PaymentStatus.PAID,
        amount: invoice.amountPaid,
        currency: invoice.currency,
        providerPaymentId: invoice.id,
        providerChargeRef: invoice.paymentRef,
        description: `Domena ${order.domainName} (1 rok)`,
        billingSnapshot: await billingSnapshot(order.userId),
        paidAt: deps.now?.() ?? new Date(),
      },
    }));
  const invoiceId = await deps.queueInvoiceForPayment(payment.id);
  if (invoiceId) await deps.enqueueInvoice(invoiceId);
  if (existing) return;

  if (order.status === DomainOrderStatus.PENDING_PAYMENT || order.status === DomainOrderStatus.CANCELED) {
    await db.domainOrder.update({
      where: { id: order.id },
      data: {
        status: DomainOrderStatus.REGISTERING,
        ...(invoice.subscriptionId ? { providerSubscriptionId: invoice.subscriptionId } : {}),
      },
    });
    await deps.enqueueDomainJob({ name: "register", orderId: order.id });
  } else if (order.status !== DomainOrderStatus.REGISTERING) {
    await deps.enqueueDomainJob({ name: "renew", orderId: order.id });
  }
}

export async function onDomainInvoiceFailed(invoice: ProviderInvoice, deps: DomainBillingDeps) {
  const order = await findOrder(invoice.subscriptionId, invoice.subscriptionMetadata);
  if (!order) throw new Error(`Domain invoice ${invoice.id}: unknown order`);
  if (await db.payment.count({ where: { providerPaymentId: invoice.id } })) return;
  await db.payment.create({
    data: {
      userId: order.userId,
      domainOrderId: order.id,
      kind: PaymentKind.DOMAIN,
      status: PaymentStatus.FAILED,
      amount: invoice.amountDue,
      currency: invoice.currency,
      providerPaymentId: invoice.id,
      description: `Domena ${order.domainName} (1 rok)`,
    },
  });
  if (order.status === DomainOrderStatus.ACTIVE)
    await deps.sendRenewalFailedMail(order.userId, order.domainName);
}
