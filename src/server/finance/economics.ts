/**
 * Unit economics of a price (pure; also used by the admin's live profit preview in the browser).
 * Prices are gross grosze. VAT is taken out first, then the payment provider's fee (percent + fixed amount per
 * charge, charged on the gross amount) and the cost of serving a client for the billed period.
 */

export type CostInputs = {
  /** VAT rate as a fraction (0.23); 0 for exempt/0% sales. */
  vatRate: number;
  /** Payment fee: percent of the gross amount (1.5 = 1.5 %) plus a fixed amount per charge (grosze). */
  feePercent: number;
  feeFixed: number;
  /** Cost of serving one client for a month (infrastructure + other fixed costs), grosze. */
  clientCostMonthly: number;
};

export type Economics = {
  gross: number;
  vat: number;
  net: number;
  fee: number;
  cost: number;
  profit: number;
  /** Profit / net revenue (0..1, negative when losing money). */
  margin: number;
};

/** `months`: how long one charge covers (1 monthly, 12 yearly); `units`: seats per charge (licenses). */
export function priceEconomics(gross: number, months: number, inputs: CostInputs, units = 1): Economics {
  const total = gross * units;
  const net = Math.round(total / (1 + inputs.vatRate));
  const vat = total - net;
  const fee = total > 0 ? Math.round((total * inputs.feePercent) / 100 + inputs.feeFixed) : 0;
  const cost = Math.round(inputs.clientCostMonthly * months * units);
  const profit = net - fee - cost;
  return { gross: total, vat, net, fee, cost, profit, margin: net > 0 ? profit / net : 0 };
}

/** Per-month view of a price (yearly prices spread over 12 months). */
export function monthlyProfit(gross: number, months: number, inputs: CostInputs): number {
  return Math.round(priceEconomics(gross, months, inputs).profit / months);
}
