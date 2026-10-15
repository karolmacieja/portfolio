import { describe, expect, it } from "vitest";

import { priceEconomics } from "./economics";
import { clientCostMonthly, financeSettingsSchema } from "./settings";

const inputs = { vatRate: 0.23, feePercent: 1.5, feeFixed: 100, clientCostMonthly: 500 };

describe("priceEconomics", () => {
  it("takes out VAT, the payment fee and the client cost", () => {
    const e = priceEconomics(3900, 1, inputs);
    expect(e.net).toBe(3171);
    expect(e.vat).toBe(729);
    expect(e.fee).toBe(159); // 1.5 % of 39 zł + 1 zł
    expect(e.cost).toBe(500);
    expect(e.profit).toBe(3171 - 159 - 500);
    expect(e.margin).toBeCloseTo(e.profit / e.net);
  });

  it("charges the fixed fee once per yearly payment and the cost for 12 months", () => {
    const e = priceEconomics(39000, 12, inputs);
    expect(e.fee).toBe(685);
    expect(e.cost).toBe(6000);
  });

  it("multiplies license seats", () => {
    expect(priceEconomics(2900, 1, inputs, 10).gross).toBe(29000);
  });

  it("reports a loss when costs exceed the net price", () => {
    expect(priceEconomics(500, 1, inputs).profit).toBeLessThan(0);
  });
});

describe("clientCostMonthly", () => {
  it("spreads the infrastructure bill and other costs over active clients", () => {
    const settings = financeSettingsSchema.parse({
      infrastructureMonthly: 20_000,
      otherCosts: [{ name: "Księgowość", monthly: 30_000 }],
    });
    expect(clientCostMonthly(settings, 100)).toBe(500);
    expect(
      clientCostMonthly({ ...settings, infrastructureMode: "fixed", costPerClientMonthly: 250 }, 100),
    ).toBe(550);
    expect(clientCostMonthly(settings, 0)).toBe(50_000);
  });
});
