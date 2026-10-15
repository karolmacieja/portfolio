import "server-only";

import { BillingInterval, PaymentStatus, SubscriptionStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/**
 * Admin dashboard metrics from our own records (payments and subscriptions mirror the provider).
 * Amounts are gross grosze. MRR counts paying, provider-managed subscriptions only (manual comps and
 * trials are reported separately); yearly prices count as 1/12 per month.
 */

export type MonthPoint = { key: string; value: number };

function lastMonths(count: number, now: Date): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

function bucket(months: string[], rows: { at: Date | null; value: number }[]): MonthPoint[] {
  const totals = new Map(months.map((m) => [m, 0]));
  for (const row of rows) {
    if (!row.at) continue;
    const key = row.at.toISOString().slice(0, 7);
    if (totals.has(key)) totals.set(key, totals.get(key)! + row.value);
  }
  return months.map((month) => ({ key: month, value: totals.get(month)! }));
}

export async function getDashboardMetrics(now = new Date()) {
  const months = lastMonths(12, now);
  const since = new Date(`${months[0]}-01T00:00:00Z`);
  const days30 = new Date(now.getTime() - 30 * 86_400_000);

  const [paying, trialing, manual, canceled30, users, paidPayments, failedPayments, canceledByMonth] =
    await Promise.all([
      db.subscription.findMany({
        where: {
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
          providerSubscriptionId: { not: null },
        },
        select: { status: true, price: { select: { amount: true, interval: true } } },
      }),
      db.subscription.count({ where: { status: SubscriptionStatus.TRIALING } }),
      db.subscription.count({
        where: {
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          providerSubscriptionId: null,
        },
      }),
      db.subscription.count({
        where: {
          providerSubscriptionId: { not: null },
          status: SubscriptionStatus.CANCELED,
          canceledAt: { gte: days30 },
        },
      }),
      db.user.findMany({ where: { createdAt: { gte: since }, role: "CLIENT" }, select: { createdAt: true } }),
      db.payment.findMany({
        where: { status: { in: [PaymentStatus.PAID, PaymentStatus.REFUNDED] }, paidAt: { gte: since } },
        select: { paidAt: true, amount: true, refundedAmount: true },
      }),
      db.payment.findMany({
        where: { status: PaymentStatus.FAILED, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      db.subscription.findMany({
        where: {
          providerSubscriptionId: { not: null },
          status: SubscriptionStatus.CANCELED,
          canceledAt: { gte: since },
        },
        select: { canceledAt: true },
      }),
    ]);

  const mrr = paying.reduce((sum, sub) => {
    if (!sub.price) return sum;
    return (
      sum +
      (sub.price.interval === BillingInterval.YEAR ? Math.round(sub.price.amount / 12) : sub.price.amount)
    );
  }, 0);
  const pastDue = paying.filter((s) => s.status === SubscriptionStatus.PAST_DUE).length;
  // Share of paying subscriptions (now + those lost) that ended in the last 30 days.
  const churnRate = paying.length + canceled30 > 0 ? canceled30 / (paying.length + canceled30) : 0;
  const newClients30 = users.filter((u) => u.createdAt >= days30).length;
  const failed30 = failedPayments.filter((p) => p.createdAt >= days30).length;

  return {
    mrr,
    activeSubscriptions: paying.length,
    pastDue,
    trialing,
    manual,
    churnRate,
    newClients30,
    failed30,
    revenue: bucket(
      months,
      paidPayments.map((p) => ({ at: p.paidAt, value: p.amount - p.refundedAmount })),
    ),
    newClients: bucket(
      months,
      users.map((u) => ({ at: u.createdAt, value: 1 })),
    ),
    failedPayments: bucket(
      months,
      failedPayments.map((p) => ({ at: p.createdAt, value: 1 })),
    ),
    cancellations: bucket(
      months,
      canceledByMonth.map((s) => ({ at: s.canceledAt, value: 1 })),
    ),
  };
}
