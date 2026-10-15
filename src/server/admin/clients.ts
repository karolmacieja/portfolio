import "server-only";

import { PaymentStatus, Role, SubscriptionStatus, type Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { allSiteTags, restoreSitesAfterPayment } from "@/server/billing/sites";
import { getPaymentProvider } from "@/server/billing/provider";
import { ENTITLED_STATUSES } from "@/server/entitlements";

/**
 * Client management for staff (not owner-scoped by design: staff act on any client). Every mutation
 * is audited by the calling action. Expected failures throw AdminError with a message key.
 */

export class AdminError extends Error {
  constructor(readonly code: string) {
    super(`Admin operation failed: ${code}`);
    this.name = "AdminError";
  }
}

export type ClientFilter = {
  q?: string;
  /** "subscribed" (entitled), "none", "pastDue", "blocked", "staff". */
  status?: "subscribed" | "none" | "pastDue" | "blocked" | "staff";
  planId?: string;
};

const entitled = { status: { in: [...ENTITLED_STATUSES] } };

export async function listClients(filter: ClientFilter = {}, take = 50, skip = 0) {
  const conditions: Prisma.UserWhereInput[] = [];
  if (filter.q) {
    conditions.push({
      OR: [
        { email: { contains: filter.q, mode: "insensitive" } },
        { name: { contains: filter.q, mode: "insensitive" } },
        { sites: { some: { slug: { contains: filter.q.toLowerCase() } } } },
        { domainOrders: { some: { domainName: { contains: filter.q.toLowerCase() } } } },
      ],
    });
  }
  switch (filter.status) {
    case "subscribed":
      conditions.push({ subscriptions: { some: entitled } });
      break;
    case "none":
      conditions.push({ subscriptions: { none: entitled }, role: Role.CLIENT });
      break;
    case "pastDue":
      conditions.push({ subscriptions: { some: { status: SubscriptionStatus.PAST_DUE } } });
      break;
    case "blocked":
      conditions.push({ blockedAt: { not: null } });
      break;
    case "staff":
      conditions.push({ role: { in: [Role.ADMIN, Role.SUPPORT] } });
      break;
  }
  if (filter.planId) conditions.push({ subscriptions: { some: { ...entitled, planId: filter.planId } } });

  const where: Prisma.UserWhereInput = conditions.length ? { AND: conditions } : {};
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        blockedAt: true,
        createdAt: true,
        _count: { select: { sites: true } },
        subscriptions: {
          where: entitled,
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, plan: { select: { name: true } } },
        },
      },
    }),
    db.user.count({ where }),
  ]);
  return { users, total };
}

export async function getClientDetail(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      billingProfile: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { plan: { select: { name: true } } },
      },
      payments: { orderBy: { createdAt: "desc" }, take: 50 },
      invoices: {
        where: { status: { not: "PENDING" } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          number: true,
          kind: true,
          status: true,
          grossAmount: true,
          currency: true,
          issueDate: true,
        },
      },
      sites: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          suspensionReason: true,
          publishedAt: true,
          domains: { select: { id: true, hostname: true, status: true, isPrimary: true } },
        },
      },
      domainOrders: {
        where: { status: { not: "CANCELED" } },
        orderBy: { createdAt: "desc" },
        select: { id: true, domainName: true, status: true, expiresAt: true, autoRenew: true },
      },
      clientNotes: { orderBy: { createdAt: "desc" }, include: { author: { select: { email: true } } } },
      impersonations: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { admin: { select: { email: true } } },
      },
    },
  });
  if (!user) throw new AdminError("notFound");
  return user;
}

export async function addClientNote(authorId: string, userId: string, body: string) {
  if (!(await db.user.count({ where: { id: userId } }))) throw new AdminError("notFound");
  return db.clientNote.create({ data: { userId, authorId, body } });
}

/**
 * Blocks or unblocks an account. Blocked users can't sign in and lose open sessions within the JWT
 * refresh window (5 minutes). Staff can't block themselves; blocking staff needs staff.manage.
 */
export async function setClientBlocked(
  actor: { id: string; canManageStaff: boolean },
  userId: string,
  blocked: boolean,
) {
  if (actor.id === userId) throw new AdminError("selfAction");
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) throw new AdminError("notFound");
  if (user.role !== Role.CLIENT && !actor.canManageStaff) throw new AdminError("staffOnly");
  await db.user.update({ where: { id: userId }, data: { blockedAt: blocked ? new Date() : null } });
}

/**
 * Grants a plan manually (no payment provider): a comp, a partner or a fix. Refused while the client
 * pays through the provider (change the plan there). Ends previous manual plans. Returns cache tags.
 */
export async function grantPlan(userId: string, planId: string, until: Date | null): Promise<string[]> {
  const [user, plan, providerManaged] = await Promise.all([
    db.user.count({ where: { id: userId } }),
    db.plan.findUnique({ where: { id: planId } }),
    db.subscription.count({
      where: { userId, providerSubscriptionId: { not: null }, ...entitled },
    }),
  ]);
  if (!user || !plan) throw new AdminError("notFound");
  if (providerManaged) throw new AdminError("managedByProvider");
  await db.$transaction([
    db.subscription.updateMany({
      where: { userId, providerSubscriptionId: null, ...entitled },
      data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
    }),
    db.subscription.create({
      data: { userId, planId, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: until },
    }),
  ]);
  return [...(await allSiteTags(userId)), ...(await restoreSitesAfterPayment(userId))];
}

/** Ends a manually granted plan right away. Returns cache tags. */
export async function revokeManualPlan(userId: string): Promise<string[]> {
  const { count } = await db.subscription.updateMany({
    where: { userId, providerSubscriptionId: null, ...entitled },
    data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
  });
  if (!count) throw new AdminError("noManualPlan");
  return allSiteTags(userId);
}

/**
 * Refunds a paid charge (fully or partly) at the payment provider. The provider's refund event then
 * updates the payment and issues the correction invoice, exactly like a refund made in Stripe.
 */
export async function refundPayment(paymentId: string, amount: number | null) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new AdminError("notFound");
  if (payment.status !== PaymentStatus.PAID || !payment.providerChargeRef)
    throw new AdminError("notRefundable");
  const remaining = payment.amount - payment.refundedAmount;
  const value = amount ?? remaining;
  if (value <= 0 || value > remaining) throw new AdminError("refundAmount");
  try {
    await getPaymentProvider().refund({ paymentRef: payment.providerChargeRef, amount: value });
  } catch (error) {
    console.error("[admin] refund failed", error);
    throw new AdminError("providerError");
  }
  return { amount: value, payment };
}
