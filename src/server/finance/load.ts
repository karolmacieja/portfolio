import "server-only";

import {
  BillingInterval,
  DomainOrderStatus,
  LicenseSource,
  PaymentKind,
  PaymentStatus,
  SponsorRemovalMode,
  SponsorRemovalStatus,
  SubscriptionStatus,
} from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { ACTIVE_LICENSE_STATUSES } from "@/server/entitlements/load";
import { getDomainSettings } from "@/server/domains/settings";

import { salesVatRate } from "./costs";
import {
  breakEvenMonth,
  forecast,
  lastMonthKeys,
  profitByMonth,
  REVENUE_SOURCES,
  type PaymentRow,
  type RevenueSource,
} from "./report";
import { fixedMonthlyCosts, getFinanceSettings } from "./settings";

const DAY = 86_400_000;
const perMonth = (amount: number, interval: BillingInterval | null) =>
  interval === BillingInterval.YEAR ? Math.round(amount / 12) : amount;

/** Recurring revenue per month by source (gross): plans, licenses, domains, monthly footer removal. */
async function currentMrr() {
  const [subscriptions, licenses, domains, addons] = await Promise.all([
    db.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        providerSubscriptionId: { not: null },
      },
      select: { price: { select: { amount: true, interval: true } } },
    }),
    db.organization.findMany({
      where: { source: LicenseSource.STRIPE, status: { in: ACTIVE_LICENSE_STATUSES } },
      select: { seatPrice: true, seats: true, interval: true },
    }),
    db.domainOrder.findMany({
      where: { status: DomainOrderStatus.ACTIVE, autoRenew: true },
      select: { priceAmount: true },
    }),
    db.sponsorRemoval.findMany({
      where: { status: SponsorRemovalStatus.ACTIVE, mode: SponsorRemovalMode.MONTHLY },
      select: { amount: true },
    }),
  ]);
  const bySource: Record<RevenueSource, number> = {
    SUBSCRIPTION: subscriptions.reduce(
      (s, x) => s + (x.price ? perMonth(x.price.amount, x.price.interval) : 0),
      0,
    ),
    LICENSE: licenses.reduce((s, x) => s + perMonth((x.seatPrice ?? 0) * x.seats, x.interval), 0),
    TEMPLATE: 0,
    DOMAIN: domains.reduce((s, x) => s + Math.round(x.priceAmount / 12), 0),
    ADDON: addons.reduce((s, x) => s + x.amount, 0),
  };
  return { bySource, total: REVENUE_SOURCES.reduce((s, k) => s + bySource[k], 0) };
}

/** Recurring revenue started per month by new customers, averaged over the last 3 months. */
async function averageNewMrr(now: Date) {
  const since = new Date(now.getTime() - 90 * DAY);
  const [subscriptions, licenses, domains] = await Promise.all([
    db.subscription.findMany({
      where: { providerSubscriptionId: { not: null }, createdAt: { gte: since } },
      select: { price: { select: { amount: true, interval: true } } },
    }),
    db.organization.findMany({
      where: { source: LicenseSource.STRIPE, createdAt: { gte: since }, status: { not: "PENDING_PAYMENT" } },
      select: { seatPrice: true, seats: true, interval: true },
    }),
    db.domainOrder.findMany({
      where: {
        createdAt: { gte: since },
        status: { in: [DomainOrderStatus.ACTIVE, DomainOrderStatus.REGISTERING] },
      },
      select: { priceAmount: true },
    }),
  ]);
  const total =
    subscriptions.reduce((s, x) => s + (x.price ? perMonth(x.price.amount, x.price.interval) : 0), 0) +
    licenses.reduce((s, x) => s + perMonth((x.seatPrice ?? 0) * x.seats, x.interval), 0) +
    domains.reduce((s, x) => s + Math.round(x.priceAmount / 12), 0);
  return Math.round(total / 3);
}

/** Share of recurring customers lost in the last 30 days (plans and licenses). */
async function monthlyChurn(now: Date) {
  const since = new Date(now.getTime() - 30 * DAY);
  const [activeSubs, lostSubs, activeLicenses, lostLicenses] = await Promise.all([
    db.subscription.count({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        providerSubscriptionId: { not: null },
      },
    }),
    db.subscription.count({
      where: {
        providerSubscriptionId: { not: null },
        status: SubscriptionStatus.CANCELED,
        canceledAt: { gte: since },
      },
    }),
    db.organization.count({ where: { status: { in: ACTIVE_LICENSE_STATUSES } } }),
    db.organization.count({ where: { status: { in: ["CANCELED", "EXPIRED"] }, updatedAt: { gte: since } } }),
  ]);
  const lost = lostSubs + lostLicenses;
  const base = activeSubs + activeLicenses + lost;
  return base > 0 ? lost / base : 0;
}

/** Paid payments (net of refunds) with the data the profit report needs. */
async function paymentRows(since: Date): Promise<PaymentRow[]> {
  const [payments, domains] = await Promise.all([
    db.payment.findMany({
      where: { status: { in: [PaymentStatus.PAID, PaymentStatus.REFUNDED] }, paidAt: { gte: since } },
      select: {
        paidAt: true,
        kind: true,
        amount: true,
        refundedAmount: true,
        billingSnapshot: true,
        domainOrder: { select: { registrarCost: true, registrarCurrency: true } },
      },
    }),
    getDomainSettings(),
  ]);
  return payments.map((p) => {
    const order = p.kind === PaymentKind.DOMAIN ? p.domainOrder : null;
    const rate =
      !order?.registrarCurrency || order.registrarCurrency === "PLN"
        ? 1
        : (domains.exchangeRates[order.registrarCurrency] ?? 0);
    return {
      paidAt: p.paidAt!,
      kind: p.kind as RevenueSource,
      amount: p.amount,
      refundedAmount: p.refundedAmount,
      reverseCharge: Boolean((p.billingSnapshot as { reverseCharge?: boolean } | null)?.reverseCharge),
      registrarCost: order?.registrarCost ? Math.round(order.registrarCost * rate) : 0,
    };
  });
}

export async function getFinanceReport(now = new Date()) {
  const months = lastMonthKeys(12, now);
  const since = new Date(`${months[0]}-01T00:00:00Z`);
  const [settings, vatRate, rows, mrr, newMrr, churnRate] = await Promise.all([
    getFinanceSettings(),
    salesVatRate(),
    paymentRows(since),
    currentMrr(),
    averageNewMrr(now),
    monthlyChurn(now),
  ]);
  const fixedMonthly = fixedMonthlyCosts(settings);
  const inputs = { vatRate, feePercent: settings.feePercent, feeFixed: settings.feeFixed, fixedMonthly };
  const history = profitByMonth(rows, months, inputs);
  const totals = history.reduce(
    (sum, m) => ({
      gross: sum.gross + m.gross,
      vat: sum.vat + m.vat,
      net: sum.net + m.net,
      fees: sum.fees + m.fees,
      registrar: sum.registrar + m.registrar,
      fixed: sum.fixed + m.fixed,
      profit: sum.profit + m.profit,
    }),
    { gross: 0, vat: 0, net: 0, fees: 0, registrar: 0, fixed: 0, profit: 0 },
  );
  const bySource = Object.fromEntries(
    REVENUE_SOURCES.map((source) => [source, history.reduce((s, m) => s + m.bySource[source], 0)]),
  ) as Record<RevenueSource, number>;

  const recent = rows.filter((r) => r.paidAt.getTime() >= now.getTime() - 90 * DAY);
  const oneTimeMonthly = Math.round(
    recent.filter((r) => r.kind === "TEMPLATE").reduce((s, r) => s + r.amount - r.refundedAmount, 0) / 3,
  );
  const averageCharge = recent.length
    ? Math.round(recent.reduce((s, r) => s + r.amount, 0) / recent.length)
    : 5_000;
  const registrarShare = totals.gross > 0 ? totals.registrar / totals.gross : 0;
  const projected = forecast(
    { ...inputs, mrr: mrr.total, churnRate, newMrr, oneTimeMonthly, averageCharge, registrarShare },
    12,
    now,
  );
  // The current month is still running; break-even compares with the last complete one.
  const lastFullMonth = history.at(-2);

  return {
    history,
    totals,
    bySource,
    mrr,
    forecast: projected,
    breakEven: breakEvenMonth(projected, lastFullMonth?.profit ?? 0),
    assumptions: { churnRate, newMrr, oneTimeMonthly, averageCharge, registrarShare, fixedMonthly, vatRate },
  };
}
