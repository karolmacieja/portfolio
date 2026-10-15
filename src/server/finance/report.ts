/**
 * Profit statistics and forecast (pure functions; data loading lives in `load.ts`). All amounts in grosze.
 * Revenue is counted when paid, net of refunds; VAT at the sales rate (reverse-charge sales carry none);
 * payment fees as configured; domain registrar costs from the orders; fixed monthly costs from the settings.
 */

export const REVENUE_SOURCES = ["SUBSCRIPTION", "LICENSE", "TEMPLATE", "DOMAIN", "ADDON"] as const;
export type RevenueSource = (typeof REVENUE_SOURCES)[number];

export type PaymentRow = {
  paidAt: Date;
  kind: RevenueSource;
  amount: number;
  refundedAmount: number;
  /** Buyer accounts for VAT (EU reverse charge): no VAT in our price. */
  reverseCharge: boolean;
  /** Registrar cost of the domain behind a DOMAIN payment, in PLN grosze (0 otherwise). */
  registrarCost: number;
};

export type ProfitInputs = { vatRate: number; feePercent: number; feeFixed: number; fixedMonthly: number };

export type MonthProfit = {
  key: string;
  gross: number;
  bySource: Record<RevenueSource, number>;
  vat: number;
  net: number;
  fees: number;
  registrar: number;
  fixed: number;
  profit: number;
};

export function lastMonthKeys(count: number, now: Date): string[] {
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - i), 1))
      .toISOString()
      .slice(0, 7),
  );
}

const emptySources = (): Record<RevenueSource, number> => ({
  SUBSCRIPTION: 0,
  LICENSE: 0,
  TEMPLATE: 0,
  DOMAIN: 0,
  ADDON: 0,
});

export function profitByMonth(payments: PaymentRow[], months: string[], inputs: ProfitInputs): MonthProfit[] {
  const rows = new Map<string, MonthProfit>(
    months.map((key) => [
      key,
      {
        key,
        gross: 0,
        bySource: emptySources(),
        vat: 0,
        net: 0,
        fees: 0,
        registrar: 0,
        fixed: inputs.fixedMonthly,
        profit: 0,
      },
    ]),
  );
  for (const payment of payments) {
    const row = rows.get(payment.paidAt.toISOString().slice(0, 7));
    if (!row) continue;
    const gross = payment.amount - payment.refundedAmount;
    const net = payment.reverseCharge ? gross : Math.round(gross / (1 + inputs.vatRate));
    row.gross += gross;
    row.bySource[payment.kind] += gross;
    row.net += net;
    row.vat += gross - net;
    // Fees stay with the provider even when the payment is refunded.
    row.fees += Math.round((payment.amount * inputs.feePercent) / 100 + inputs.feeFixed);
    row.registrar += payment.registrarCost;
  }
  for (const row of rows.values()) row.profit = row.net - row.fees - row.registrar - row.fixed;
  return months.map((key) => rows.get(key)!);
}

export type ForecastInputs = ProfitInputs & {
  /** Monthly recurring revenue now (gross; yearly charges spread over 12 months). */
  mrr: number;
  /** Share of recurring revenue lost per month (0..1). */
  churnRate: number;
  /** Recurring revenue added per month by new customers (gross). */
  newMrr: number;
  /** One-time revenue per month (templates, one-time add-ons; gross). */
  oneTimeMonthly: number;
  /** Average gross amount of one charge (estimates how many fixed fees a month of revenue costs). */
  averageCharge: number;
  /** Registrar costs as a share of gross revenue (domains). */
  registrarShare: number;
};

export type ForecastMonth = { key: string; mrr: number; revenue: number; profit: number };

/** MRR(m+1) = MRR(m) × (1 − churn) + new MRR; revenue = MRR + one-time; profit after VAT, fees and costs. */
export function forecast(inputs: ForecastInputs, months: number, now: Date): ForecastMonth[] {
  const result: ForecastMonth[] = [];
  let mrr = inputs.mrr;
  for (let i = 1; i <= months; i++) {
    mrr = Math.max(0, mrr * (1 - inputs.churnRate) + inputs.newMrr);
    const revenue = Math.round(mrr + inputs.oneTimeMonthly);
    const net = Math.round(revenue / (1 + inputs.vatRate));
    const charges = inputs.averageCharge > 0 ? revenue / inputs.averageCharge : 0;
    const fees = Math.round((revenue * inputs.feePercent) / 100 + charges * inputs.feeFixed);
    const registrar = Math.round(revenue * inputs.registrarShare);
    const key = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)).toISOString().slice(0, 7);
    result.push({ key, mrr: Math.round(mrr), revenue, profit: net - fees - registrar - inputs.fixedMonthly });
  }
  return result;
}

/** Months until monthly profit turns positive (0 = already), null if not within the horizon. */
export function breakEvenMonth(months: ForecastMonth[], currentProfit: number): number | null {
  if (currentProfit >= 0) return 0;
  const index = months.findIndex((m) => m.profit >= 0);
  return index === -1 ? null : index + 1;
}
