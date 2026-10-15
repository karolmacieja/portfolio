/**
 * Server scaling forecast (pure): a least-squares trend over daily values, projected forward, and the day a
 * metric is expected to cross the warning level and the full capacity.
 */

export type Point = { day: Date; value: number };

export type MetricForecast = {
  current: number;
  /** Growth per day (trend slope). */
  perDay: number;
  capacity: number;
  /** current / capacity (0 when not tracked). */
  usage: number;
  in90Days: number;
  /** Days until the warning level / full capacity; 0 = already there; null = not reached (flat, shrinking, untracked). */
  daysToWarn: number | null;
  daysToFull: number | null;
};

const DAY = 86_400_000;

/** Slope (units per day) of the least-squares line through the points; 0 with fewer than two days. */
export function dailyTrend(points: Point[]): number {
  if (points.length < 2) return 0;
  const xs = points.map((p) => p.day.getTime() / DAY);
  const ys = points.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Beyond this the trend says nothing useful (and dates would overflow). */
const HORIZON_DAYS = 3650;

function daysUntil(current: number, perDay: number, target: number): number | null {
  if (target <= 0) return null;
  if (current >= target) return 0;
  if (perDay <= 0) return null;
  const days = Math.ceil((target - current) / perDay);
  return days > HORIZON_DAYS ? null : days;
}

export function forecastMetric(
  points: Point[],
  current: number,
  capacity: number,
  warnAtPercent: number,
): MetricForecast {
  const perDay = dailyTrend(points);
  return {
    current,
    perDay,
    capacity,
    usage: capacity > 0 ? current / capacity : 0,
    in90Days: Math.max(0, current + perDay * 90),
    daysToWarn: capacity > 0 ? daysUntil(current, perDay, (capacity * warnAtPercent) / 100) : null,
    daysToFull: capacity > 0 ? daysUntil(current, perDay, capacity) : null,
  };
}
