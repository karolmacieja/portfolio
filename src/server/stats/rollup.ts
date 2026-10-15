import { db } from "@/lib/db";

import { dayToDate, statsDay } from "./day";

/** Page view counts are kept for 25 months (a year-over-year comparison and a margin). */
export const STATS_RETENTION_DAYS = 760;

/**
 * Worker, daily: turns visitor hashes of finished days into unique-visitor counts and deletes the hashes,
 * then removes counts older than the retention period.
 */
export async function rollupStats(now = new Date()): Promise<{ days: number; purged: number }> {
  const today = dayToDate(statsDay(now));
  const groups = await db.siteDailyVisitor.groupBy({
    by: ["siteId", "day"],
    where: { day: { lt: today } },
    _count: { _all: true },
  });
  for (const group of groups) {
    await db.$transaction([
      db.siteDailyUnique.upsert({
        where: { siteId_day: { siteId: group.siteId, day: group.day } },
        create: { siteId: group.siteId, day: group.day, visitors: group._count._all },
        update: { visitors: { increment: group._count._all } },
      }),
      db.siteDailyVisitor.deleteMany({ where: { siteId: group.siteId, day: group.day } }),
    ]);
  }
  const cutoff = new Date(today.getTime() - STATS_RETENTION_DAYS * 86_400_000);
  const [views, uniques] = await db.$transaction([
    db.siteDailyStat.deleteMany({ where: { day: { lt: cutoff } } }),
    db.siteDailyUnique.deleteMany({ where: { day: { lt: cutoff } } }),
  ]);
  return { days: groups.length, purged: views.count + uniques.count };
}
