import {
  LicenseStatus,
  PaymentKind,
  PaymentStatus,
  SponsorRemovalMode,
  SponsorRemovalStatus,
  SubscriptionStatus,
} from "@/generated/prisma/client";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import type { BillingDeps } from "@/server/billing/deps";
import { allSiteTags, restoreSitesAfterPayment, suspendSitesForPayment } from "@/server/billing/sites";
import { billingSnapshot } from "@/server/billing/snapshot";
import { getEntitlements } from "@/server/entitlements/load";
import { queueInvoiceForPayment } from "@/server/invoicing/service";
import { buildLinkMail } from "@/server/mail/templates";
import type { ProviderInvoice, ProviderSubscription } from "@/server/payments/types";

/**
 * Billing events of group licenses (metadata kind "license") and sponsor footer removal add-ons (kind
 * "sponsor-removal"). Called from billing/events.ts inside its idempotency guard; never touches plan
 * subscriptions. Worker-safe (no `server-only` imports).
 */

export const isLicenseMetadata = (metadata: Record<string, string>) => metadata.kind === "license";
export const isSponsorRemovalMetadata = (metadata: Record<string, string>) =>
  metadata.kind === "sponsor-removal";

async function findOrganization(subscriptionId: string | null, metadata: Record<string, string>) {
  if (metadata.organizationId) {
    const org = await db.organization.findUnique({ where: { id: metadata.organizationId } });
    if (org) return org;
  }
  return subscriptionId
    ? db.organization.findUnique({ where: { providerSubscriptionId: subscriptionId } })
    : null;
}

async function findRemoval(subscriptionId: string | null, metadata: Record<string, string>) {
  if (metadata.userId) {
    const removal = await db.sponsorRemoval.findUnique({ where: { userId: metadata.userId } });
    if (removal) return removal;
  }
  return subscriptionId
    ? db.sponsorRemoval.findUnique({ where: { providerSubscriptionId: subscriptionId } })
    : null;
}

/** Which add-on an invoice pays for (by its subscription metadata, or the stored subscription id). */
export async function inlineInvoiceKind(
  invoice: ProviderInvoice,
): Promise<"license" | "sponsor-removal" | null> {
  if (isLicenseMetadata(invoice.subscriptionMetadata)) return "license";
  if (isSponsorRemovalMetadata(invoice.subscriptionMetadata)) return "sponsor-removal";
  if (!invoice.subscriptionId) return null;
  if (await db.organization.count({ where: { providerSubscriptionId: invoice.subscriptionId } }))
    return "license";
  if (await db.sponsorRemoval.count({ where: { providerSubscriptionId: invoice.subscriptionId } }))
    return "sponsor-removal";
  return null;
}

/** Cache tags of every member's sites (license changes alter their footer, plan and suspension). */
export async function memberSiteTags(organizationId: string): Promise<string[]> {
  const members = await db.organizationMember.findMany({
    where: { organizationId },
    select: { userId: true },
  });
  return (await Promise.all(members.map((m) => allSiteTags(m.userId)))).flat();
}

/**
 * Applies a license status change to members: an active license restores sites suspended for payment;
 * an ended one suspends the sites of members left without any plan and tells them.
 */
export async function applyLicenseStatus(
  organizationId: string,
  active: boolean,
  deps: Pick<BillingDeps, "invalidate" | "mailer" | "brand" | "billingUrl">,
) {
  const members = await db.organizationMember.findMany({
    where: { organizationId },
    include: { user: { select: { email: true, locale: true } }, organization: { select: { name: true } } },
  });
  const tags = await memberSiteTags(organizationId);
  for (const member of members) {
    if (active) {
      tags.push(...(await restoreSitesAfterPayment(member.userId)));
      continue;
    }
    if ((await getEntitlements(member.userId)).canPublish) continue;
    const suspended = await suspendSitesForPayment(member.userId);
    tags.push(...suspended);
    try {
      await deps.mailer.send(
        await buildLinkMail({
          kind: "licenseEnded",
          to: member.user.email,
          url: deps.billingUrl.replace(/\/billing$/, "/plans"),
          locale: isLocale(member.user.locale) ? member.user.locale : "pl",
          brand: deps.brand,
          values: { domain: member.organization.name },
        }),
      );
    } catch (error) {
      console.error("[licenses] license ended mail failed", error);
    }
  }
  await deps.invalidate(tags);
}

async function mailManager(userId: string, kind: "paymentFailed", deps: BillingDeps) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, locale: true } });
  if (!user) return;
  try {
    await deps.mailer.send(
      await buildLinkMail({
        kind,
        to: user.email,
        url: deps.billingUrl.replace(/\/billing$/, "/organization"),
        locale: isLocale(user.locale) ? user.locale : "pl",
        brand: deps.brand,
      }),
    );
  } catch (error) {
    console.error(`[licenses] ${kind} mail failed`, error);
  }
}

const LICENSE_STATUS: Partial<Record<SubscriptionStatus, LicenseStatus>> = {
  [SubscriptionStatus.TRIALING]: LicenseStatus.ACTIVE,
  [SubscriptionStatus.ACTIVE]: LicenseStatus.ACTIVE,
  [SubscriptionStatus.PAST_DUE]: LicenseStatus.PAST_DUE,
  [SubscriptionStatus.INCOMPLETE]: LicenseStatus.PENDING_PAYMENT,
};

export async function onInlineCheckoutCompleted(
  subscriptionId: string | null,
  metadata: Record<string, string>,
) {
  if (!subscriptionId) return;
  if (isLicenseMetadata(metadata)) {
    const org = await findOrganization(subscriptionId, metadata);
    if (!org) throw new Error(`License checkout: unknown organization ${metadata.organizationId}`);
    if (!org.providerSubscriptionId) {
      await db.organization.update({
        where: { id: org.id },
        data: { providerSubscriptionId: subscriptionId },
      });
    }
    return;
  }
  const removal = await findRemoval(subscriptionId, metadata);
  if (removal && !removal.providerSubscriptionId) {
    await db.sponsorRemoval.update({
      where: { id: removal.id },
      data: { providerSubscriptionId: subscriptionId },
    });
  }
}

export async function onInlineSubscriptionChanged(
  subscription: ProviderSubscription,
  deleted: boolean,
  deps: BillingDeps,
) {
  if (isLicenseMetadata(subscription.metadata)) {
    const org = await findOrganization(subscription.id, subscription.metadata);
    if (!org) throw new Error(`License subscription ${subscription.id}: unknown organization`);
    const status = deleted
      ? LicenseStatus.CANCELED
      : (LICENSE_STATUS[subscription.status] ?? LicenseStatus.CANCELED);
    const wasActive = org.status === LicenseStatus.ACTIVE || org.status === LicenseStatus.PAST_DUE;
    await db.organization.update({
      where: { id: org.id },
      data: {
        providerSubscriptionId: subscription.id,
        status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        ...(subscription.quantity ? { seats: subscription.quantity } : {}),
      },
    });
    const isActive = status === LicenseStatus.ACTIVE || status === LicenseStatus.PAST_DUE;
    if (wasActive !== isActive) await applyLicenseStatus(org.id, isActive, deps);
    else await deps.invalidate(await memberSiteTags(org.id));
    return;
  }
  const removal = await findRemoval(subscription.id, subscription.metadata);
  if (!removal) throw new Error(`Add-on subscription ${subscription.id}: unknown`);
  const active = !deleted && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(subscription.status);
  await db.sponsorRemoval.update({
    where: { id: removal.id },
    data: {
      providerSubscriptionId: subscription.id,
      status: active ? SponsorRemovalStatus.ACTIVE : SponsorRemovalStatus.CANCELED,
    },
  });
  await deps.invalidate(await allSiteTags(removal.userId));
}

async function recordPayment(
  data: {
    userId: string;
    kind: PaymentKind;
    status: PaymentStatus;
    amount: number;
    currency: string;
    providerPaymentId: string;
    providerChargeRef?: string | null;
    description: string;
    organizationId?: string;
  },
  deps: BillingDeps,
) {
  const existing = await db.payment.findUnique({ where: { providerPaymentId: data.providerPaymentId } });
  if (existing) return existing;
  const paid = data.status === PaymentStatus.PAID;
  const payment = await db.payment.create({
    data: {
      ...data,
      providerChargeRef: data.providerChargeRef ?? null,
      ...(paid
        ? { billingSnapshot: await billingSnapshot(data.userId), paidAt: deps.now?.() ?? new Date() }
        : {}),
    },
  });
  if (paid) {
    const invoiceId = await queueInvoiceForPayment(payment.id);
    if (invoiceId) await deps.enqueueInvoice(invoiceId);
  }
  return payment;
}

export async function onInlineInvoice(invoice: ProviderInvoice, paid: boolean, deps: BillingDeps) {
  const kind = await inlineInvoiceKind(invoice);
  if (kind === "license") {
    const org = await findOrganization(invoice.subscriptionId, invoice.subscriptionMetadata);
    if (!org?.managerId) throw new Error(`License invoice ${invoice.id}: unknown organization`);
    if (paid && invoice.amountPaid <= 0) return;
    await recordPayment(
      {
        userId: org.managerId,
        organizationId: org.id,
        kind: PaymentKind.LICENSE,
        status: paid ? PaymentStatus.PAID : PaymentStatus.FAILED,
        amount: paid ? invoice.amountPaid : invoice.amountDue,
        currency: invoice.currency,
        providerPaymentId: invoice.id,
        providerChargeRef: invoice.paymentRef,
        description: invoice.description,
      },
      deps,
    );
    if (!paid && org.status === LicenseStatus.ACTIVE) await mailManager(org.managerId, "paymentFailed", deps);
    const next = paid ? LicenseStatus.ACTIVE : LicenseStatus.PAST_DUE;
    if (org.status !== next && org.status !== LicenseStatus.CANCELED) {
      const wasActive = org.status === LicenseStatus.ACTIVE || org.status === LicenseStatus.PAST_DUE;
      await db.organization.update({ where: { id: org.id }, data: { status: next } });
      if (!wasActive) await applyLicenseStatus(org.id, true, deps);
    }
    return;
  }
  const removal = await findRemoval(invoice.subscriptionId, invoice.subscriptionMetadata);
  if (!removal) throw new Error(`Add-on invoice ${invoice.id}: unknown`);
  if (paid && invoice.amountPaid <= 0) return;
  await recordPayment(
    {
      userId: removal.userId,
      kind: PaymentKind.ADDON,
      status: paid ? PaymentStatus.PAID : PaymentStatus.FAILED,
      amount: paid ? invoice.amountPaid : invoice.amountDue,
      currency: invoice.currency,
      providerPaymentId: invoice.id,
      providerChargeRef: invoice.paymentRef,
      description: invoice.description,
    },
    deps,
  );
  if (paid && removal.status !== SponsorRemovalStatus.ACTIVE) {
    await db.sponsorRemoval.update({
      where: { id: removal.id },
      data: { status: SponsorRemovalStatus.ACTIVE },
    });
    await deps.invalidate(await allSiteTags(removal.userId));
  }
}

/** One-time sponsor footer removal (Checkout in payment mode). */
export async function onSponsorRemovalPaid(
  event: {
    sessionId: string;
    amountTotal: number | null;
    currency: string | null;
    paymentRef: string | null;
  },
  userId: string,
  deps: BillingDeps,
) {
  await db.sponsorRemoval.upsert({
    where: { userId },
    update: { status: SponsorRemovalStatus.ACTIVE, mode: SponsorRemovalMode.ONCE },
    create: {
      userId,
      mode: SponsorRemovalMode.ONCE,
      status: SponsorRemovalStatus.ACTIVE,
      amount: event.amountTotal ?? 0,
    },
  });
  await recordPayment(
    {
      userId,
      kind: PaymentKind.ADDON,
      status: PaymentStatus.PAID,
      amount: event.amountTotal ?? 0,
      currency: event.currency ?? "PLN",
      providerPaymentId: event.sessionId,
      providerChargeRef: event.paymentRef,
      description: "Usunięcie stopki sponsora",
    },
    deps,
  );
  await deps.invalidate(await allSiteTags(userId));
}

/** A fully refunded add-on brings the footer back. */
export async function onAddonRefunded(userId: string, deps: BillingDeps) {
  await db.sponsorRemoval.updateMany({ where: { userId }, data: { status: SponsorRemovalStatus.CANCELED } });
  await deps.invalidate(await allSiteTags(userId));
}
