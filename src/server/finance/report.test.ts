import { describe, expect, it } from "vitest";

import { breakEvenMonth, forecast, lastMonthKeys, profitByMonth, type PaymentRow } from "./report";

const inputs = { vatRate: 0.23, feePercent: 1.5, feeFixed: 100, fixedMonthly: 10_000 };
const now = new Date("2026-10-15T12:00:00Z");

describe("profitByMonth", () => {
  it("splits revenue by source and takes out VAT, fees, registrar and fixed costs", () => {
    const months = lastMonthKeys(2, now);
    expect(months).toEqual(["2026-09", "2026-10"]);
    const payments: PaymentRow[] = [
      {
        paidAt: new Date("2026-10-02"),
        kind: "SUBSCRIPTION",
        amount: 12_300,
        refundedAmount: 0,
        reverseCharge: false,
        registrarCost: 0,
      },
      {
        paidAt: new Date("2026-10-03"),
        kind: "DOMAIN",
        amount: 12_300,
        refundedAmount: 0,
        reverseCharge: false,
        registrarCost: 4_000,
      },
      {
        paidAt: new Date("2026-10-04"),
        kind: "LICENSE",
        amount: 10_000,
        refundedAmount: 0,
        reverseCharge: true,
        registrarCost: 0,
      },
      {
        paidAt: new Date("2026-10-05"),
        kind: "TEMPLATE",
        amount: 4_900,
        refundedAmount: 4_900,
        reverseCharge: false,
        registrarCost: 0,
      },
      {
        paidAt: new Date("2025-01-01"),
        kind: "TEMPLATE",
        amount: 9_999,
        refundedAmount: 0,
        reverseCharge: false,
        registrarCost: 0,
      },
    ];
    const [september, october] = profitByMonth(payments, months, inputs);
    expect(september).toMatchObject({ gross: 0, profit: -10_000 });
    expect(october!.bySource).toMatchObject({
      SUBSCRIPTION: 12_300,
      DOMAIN: 12_300,
      LICENSE: 10_000,
      TEMPLATE: 0,
    });
    expect(october!.net).toBe(10_000 + 10_000 + 10_000);
    expect(october!.vat).toBe(4_600);
    expect(october!.registrar).toBe(4_000);
    // The refunded template still cost its fee.
    expect(october!.fees).toBe(Math.round(12_300 * 0.015 + 100) * 2 + 250 + Math.round(4_900 * 0.015 + 100));
    expect(october!.profit).toBe(october!.net - october!.fees - 4_000 - 10_000);
  });
});

describe("forecast", () => {
  const base = {
    ...inputs,
    mrr: 100_000,
    churnRate: 0.05,
    newMrr: 10_000,
    oneTimeMonthly: 0,
    averageCharge: 5_000,
    registrarShare: 0,
  };

  it("grows MRR by new revenue minus churn towards newMrr / churn", () => {
    const months = forecast(base, 12, now);
    expect(months[0]).toMatchObject({ key: "2026-11", mrr: 105_000 });
    expect(months[11]!.mrr).toBeGreaterThan(months[0]!.mrr);
    expect(months[11]!.mrr).toBeLessThan(200_000);
  });

  it("finds the break-even month", () => {
    const losing = forecast({ ...base, mrr: 0, newMrr: 5_000, fixedMonthly: 15_000 }, 12, now);
    expect(breakEvenMonth(losing, -15_000)).toBeGreaterThan(1);
    expect(breakEvenMonth(losing, 1)).toBe(0);
  });
});
