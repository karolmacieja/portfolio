import "server-only";

import { db } from "@/lib/db";
import { SiteError } from "@/server/sites/errors";

import { dayRange, dayToDate, statsDay } from "./day";

export type SiteStats = {
  days: { day: string; views: number; visitors: number }[];
  totals: { views: number; visitors: number };
  topPages: { path: string; views: number }[];
};

/** Owner-scoped statistics of one site for the last `count` days (today included, live). */
export async function getSiteStats(
  ownerId: string,
  siteId: string,
  count = 30,
  now = new Date(),
): Promise<SiteStats> {
  const site = await db.site.findFirst({ where: { id: siteId, ownerId }, select: { id: true } });
  if (!site) throw new SiteError("notFound");
  const keys = dayRange(statsDay(now), count);
  const since = dayToDate(keys[0]!);
  const [views, uniques, live, pages] = await Promise.all([
    db.siteDailyStat.groupBy({ by: ["day"], where: { siteId, day: { gte: since } }, _sum: { views: true } }),
    db.siteDailyUnique.findMany({ where: { siteId, day: { gte: since } } }),
    // Days not rolled up yet (today, or yesterday before the nightly job) are counted from the hashes.
    db.siteDailyVisitor.groupBy({
      by: ["day"],
      where: { siteId, day: { gte: since } },
      _count: { _all: true },
    }),
    db.siteDailyStat.groupBy({
      by: ["path"],
      where: { siteId, day: { gte: since } },
      _sum: { views: true },
      orderBy: { _sum: { views: "desc" } },
      take: 10,
    }),
  ]);
  const key = (date: Date) => date.toISOString().slice(0, 10);
  const viewsByDay = new Map(views.map((row) => [key(row.day), row._sum.views ?? 0]));
  const visitorsByDay = new Map<string, number>();
  for (const row of uniques) visitorsByDay.set(key(row.day), row.visitors);
  for (const row of live)
    visitorsByDay.set(key(row.day), (visitorsByDay.get(key(row.day)) ?? 0) + row._count._all);

  const days = keys.map((day) => ({
    day,
    views: viewsByDay.get(day) ?? 0,
    visitors: visitorsByDay.get(day) ?? 0,
  }));
  return {
    days,
    totals: {
      views: days.reduce((sum, d) => sum + d.views, 0),
      visitors: days.reduce((sum, d) => sum + d.visitors, 0),
    },
    topPages: pages.map((row) => ({ path: row.path, views: row._sum.views ?? 0 })),
  };
}
