import { describe, expect, it } from "vitest";

import { fromDecimal, splitGross, toDecimal } from "./amounts";

describe("splitGross", () => {
  it("splits gross prices at 23%", () => {
    expect(splitGross(3900, "23")).toEqual({ netAmount: 3171, vatAmount: 729 });
    expect(splitGross(19000, "23")).toEqual({ netAmount: 15447, vatAmount: 3553 });
  });

  it("keeps the full amount as net for exempt, zero and reverse-charge rates", () => {
    expect(splitGross(3900, "zw")).toEqual({ netAmount: 3900, vatAmount: 0 });
    expect(splitGross(3900, "np")).toEqual({ netAmount: 3900, vatAmount: 0 });
    expect(splitGross(3900, "0")).toEqual({ netAmount: 3900, vatAmount: 0 });
  });

  it("is symmetric for negative (correction) amounts", () => {
    expect(splitGross(-3900, "23")).toEqual({ netAmount: -3171, vatAmount: -729 });
    expect(splitGross(-1000, "8")).toEqual({ netAmount: -926, vatAmount: -74 });
  });
});

describe("decimal conversion", () => {
  it("formats and parses API amounts", () => {
    expect(toDecimal(3900)).toBe("39.00");
    expect(toDecimal(-1950)).toBe("-19.50");
    expect(fromDecimal("31,71")).toBe(3171);
    expect(fromDecimal(-7.29)).toBe(-729);
  });
});
