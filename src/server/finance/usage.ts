import { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { dayToDate, statsDay } from "@/server/stats/day";

import { getCapacitySettings } from "./capacity";
import { forecastMetric, type Point } from "./capacity-forecast";
import { countActiveClients } from "./costs";

/**
 * Platform usage: daily snapshots (worker, after midnight) and the admin usage report with the server
 * scaling forecast. Worker-safe (no `server-only` imports).
 */

const DAY = 86_400_000;
const GB = 1024 ** 3;

async function databaseBytes(): Promise<bigint> {
  const [row] = await db.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
  return row?.size ?? 0n;
}

async function currentCounts() {
  const [clients, payingClients, sites, publishedSites, storage, dbBytes] = await Promise.all([
    db.user.count({ where: { role: Role.CLIENT, deletedAt: null } }),
    countActiveClients(),
    db.site.count(),
    db.site.count({ where: { publishedAt: { not: null }, status: "ACTIVE" } }),
    db.asset.aggregate({ _sum: { sizeBytes: true } }),
    databaseBytes(),
  ]);
  return {
    clients,
    payingClients,
    sites,
    publishedSites,
    storageBytes: BigInt(storage._sum.sizeBytes ?? 0),
    databaseBytes: dbBytes,
  };
}

/** Worker, daily: stores yesterday's snapshot (page views of the finished day) and backfills an empty history. */
export async function takeUsageSnapshot(now = new Date()): Promise<void> {
  const yesterday = dayToDate(statsDay(new Date(now.getTime() - DAY)));
  if ((await db.usageSnapshot.count()) === 0) await backfillUsageSnapshots(now);
  const [counts, views] = await Promise.all([
    currentCounts(),
    db.siteDailyStat.aggregate({ where: { day: yesterday }, _sum: { views: true } }),
  ]);
  const data = { ...counts, pageViews: views._sum.views ?? 0 };
  await db.usageSnapshot.upsert({
    where: { day: yesterday },
    update: data,
    create: { day: yesterday, ...data },
  });
}

/**
 * A first history for the forecast, reconstructed from creation dates (clients, sites, files) and page view
 * counts of the last 90 days; database size and paying clients are only known now, so they stay flat.
 */
export async function backfillUsageSnapshots(now = new Date(), days = 90): Promise<number> {
  const counts = await currentCounts();
  const [users, sites, assets, views] = await Promise.all([
    db.user.findMany({ where: { role: Role.CLIENT, deletedAt: null }, select: { createdAt: true } }),
    db.site.findMany({ select: { createdAt: true, publishedAt: true } }),
    db.asset.findMany({ select: { createdAt: true, sizeBytes: true } }),
    db.siteDailyStat.groupBy({
      by: ["day"],
      where: { day: { gte: new Date(now.getTime() - days * DAY) } },
      _sum: { views: true },
    }),
  ]);
  const viewsByDay = new Map(views.map((v) => [v.day.toISOString().slice(0, 10), v._sum.views ?? 0]));
  const rows = [];
  for (let i = days; i >= 1; i--) {
    const key = statsDay(new Date(now.getTime() - i * DAY));
    const day = dayToDate(key);
    const end = day.getTime() + DAY;
    rows.push({
      day,
      clients: users.filter((u) => u.createdAt.getTime() < end).length,
      payingClients: counts.payingClients,
      sites: sites.filter((s) => s.createdAt.getTime() < end).length,
      publishedSites: sites.filter((s) => s.publishedAt && s.publishedAt.getTime() < end).length,
      storageBytes: BigInt(
        assets.filter((a) => a.createdAt.getTime() < end).reduce((sum, a) => sum + a.sizeBytes, 0),
      ),
      databaseBytes: counts.databaseBytes,
      pageViews: viewsByDay.get(key) ?? 0,
    });
  }
  const { count } = await db.usageSnapshot.createMany({ data: rows, skipDuplicates: true });
  return count;
}

/** Usage now, 90-day history and the capacity forecast for the admin usage page. */
export async function getUsageReport(now = new Date()) {
  // First visit before the worker's first daily snapshot: reconstruct a history to show.
  if ((await db.usageSnapshot.count()) === 0) await backfillUsageSnapshots(now);
  const since = new Date(now.getTime() - 90 * DAY);
  const [counts, history, capacity, views30, topSites, topStorage] = await Promise.all([
    currentCounts(),
    db.usageSnapshot.findMany({ where: { day: { gte: since } }, orderBy: { day: "asc" } }),
    getCapacitySettings(),
    db.siteDailyStat.aggregate({
      where: { day: { gte: new Date(now.getTime() - 30 * DAY) } },
      _sum: { views: true },
    }),
    db.siteDailyStat.groupBy({
      by: ["siteId"],
      where: { day: { gte: new Date(now.getTime() - 30 * DAY) } },
      _sum: { views: true },
      orderBy: { _sum: { views: "desc" } },
      take: 10,
    }),
    db.asset.groupBy({
      by: ["ownerId"],
      _sum: { sizeBytes: true },
      orderBy: { _sum: { sizeBytes: "desc" } },
      take: 10,
    }),
  ]);
  const [siteNames, owners] = await Promise.all([
    db.site.findMany({
      where: { id: { in: topSites.map((s) => s.siteId) } },
      select: { id: true, name: true, slug: true },
    }),
    db.user.findMany({
      where: { id: { in: topStorage.map((o) => o.ownerId) } },
      select: { id: true, email: true },
    }),
  ]);

  const series = (pick: (row: (typeof history)[number]) => number): Point[] =>
    history.map((row) => ({ day: row.day, value: pick(row) }));
  // Monthly page views as a rolling 30-day sum, so the trend is per month of traffic.
  const rolling: Point[] = history.map((row, i) => ({
    day: row.day,
    value: history.slice(Math.max(0, i - 29), i + 1).reduce((sum, r) => sum + r.pageViews, 0),
  }));
  const pageViews30 = views30._sum.views ?? 0;
  const warn = capacity.warnAtPercent;

  return {
    generatedAt: now,
    counts: { ...counts, pageViews30 },
    history: history.map((row) => ({
      key: row.day.toISOString().slice(0, 10),
      clients: row.clients,
      storageBytes: Number(row.storageBytes),
      pageViews: row.pageViews,
    })),
    capacity,
    forecast: {
      database: forecastMetric(
        series((r) => Number(r.databaseBytes) / GB),
        Number(counts.databaseBytes) / GB,
        capacity.databaseGb,
        warn,
      ),
      storage: forecastMetric(
        series((r) => Number(r.storageBytes) / GB),
        Number(counts.storageBytes) / GB,
        capacity.storageGb,
        warn,
      ),
      pageViews: forecastMetric(rolling, pageViews30, capacity.monthlyPageViews, warn),
      sites: forecastMetric(
        series((r) => r.publishedSites),
        counts.publishedSites,
        capacity.activeSites,
        warn,
      ),
    },
    topSites: topSites.map((row) => ({
      ...siteNames.find((s) => s.id === row.siteId),
      views: row._sum.views ?? 0,
    })),
    topStorage: topStorage.map((row) => ({
      email: owners.find((o) => o.id === row.ownerId)?.email ?? "—",
      userId: row.ownerId,
      bytes: row._sum.sizeBytes ?? 0,
    })),
  };
}

/** One client's usage across their sites (dashboard and admin client card). */
export async function getClientUsage(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY);
  const [views, storage, sites, published, messages] = await Promise.all([
    db.siteDailyStat.aggregate({
      where: { site: { ownerId: userId }, day: { gte: since } },
      _sum: { views: true },
    }),
    db.asset.aggregate({ where: { ownerId: userId }, _sum: { sizeBytes: true } }),
    db.site.count({ where: { ownerId: userId } }),
    db.site.count({ where: { ownerId: userId, publishedAt: { not: null } } }),
    db.contactMessage.count({ where: { site: { ownerId: userId }, createdAt: { gte: since } } }),
  ]);
  return {
    views30: views._sum.views ?? 0,
    storageBytes: storage._sum.sizeBytes ?? 0,
    sites,
    published,
    messages30: messages,
  };
}
