import { describe, expect, it } from "vitest";

import { dailyTrend, forecastMetric } from "./capacity-forecast";

const days = (values: number[]) =>
  values.map((value, i) => ({ day: new Date(Date.UTC(2026, 0, 1 + i)), value }));

describe("capacity forecast", () => {
  it("fits the daily trend", () => {
    expect(dailyTrend(days([10, 20, 30, 40]))).toBeCloseTo(10);
    expect(dailyTrend(days([5]))).toBe(0);
  });

  it("projects when the warning level and the capacity are reached", () => {
    const f = forecastMetric(days([0, 10, 20, 30, 40]), 40, 100, 80);
    expect(f).toMatchObject({ usage: 0.4, daysToWarn: 4, daysToFull: 6, in90Days: 940 });
  });

  it("does not warn for flat or untracked metrics, and flags metrics already over", () => {
    expect(forecastMetric(days([50, 50, 50]), 50, 100, 80).daysToWarn).toBeNull();
    expect(forecastMetric(days([1, 2]), 2, 0, 80).daysToFull).toBeNull();
    expect(forecastMetric(days([90, 95]), 95, 100, 80).daysToWarn).toBe(0);
    // A trickle of growth: not within the 10-year horizon.
    expect(forecastMetric(days([1, 1.000001]), 1, 1_000_000, 80).daysToFull).toBeNull();
  });
});
