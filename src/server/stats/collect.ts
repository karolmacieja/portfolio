import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { isBotUserAgent } from "@/lib/bots";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { getPublishedSite, resolveSiteIdByHost } from "@/server/sites/public";

import { dayToDate, statsDay } from "./day";

/**
 * Cookie-less page view counter (plan feature `analytics`). A visitor is identified within one day only,
 * by hashing a random per-day salt (kept in Redis for two days, never stored with the data) with the site,
 * IP and user agent. Hashes are rolled up into daily counts and deleted by the worker, so visits are not
 * linkable across days and no personal data is kept.
 */

const SALT_TTL_SECONDS = 2 * 86_400;

async function dailySalt(day: string): Promise<string> {
  const redis = getRedis();
  const key = `stats:salt:${day}`;
  await redis.set(key, randomBytes(16).toString("hex"), "EX", SALT_TTL_SECONDS, "NX");
  return (await redis.get(key)) ?? "";
}

export type PageViewInput = { host: string; path: string; ip: string; userAgent: string | null; now?: Date };

/** Returns whether the view was counted. */
export async function recordPageView(input: PageViewInput): Promise<boolean> {
  if (isBotUserAgent(input.userAgent)) return false;
  const siteId = await resolveSiteIdByHost(input.host);
  const site = siteId ? await getPublishedSite(siteId) : null;
  if (!site?.published || site.suspended || !site.analytics) return false;
  if (!site.navigation.some((page) => page.path === input.path)) return false;

  const day = statsDay(input.now ?? new Date());
  const date = dayToDate(day);
  const hash = createHash("sha256")
    .update(`${await dailySalt(day)}:${site.id}:${input.ip}:${input.userAgent}`)
    .digest("hex")
    .slice(0, 32);
  await db.$transaction([
    db.$executeRaw`INSERT INTO "SiteDailyStat" ("siteId", "day", "path", "views") VALUES (${site.id}, ${date}, ${input.path}, 1)
      ON CONFLICT ("siteId", "day", "path") DO UPDATE SET "views" = "SiteDailyStat"."views" + 1`,
    db.siteDailyVisitor.createMany({ data: [{ siteId: site.id, day: date, hash }], skipDuplicates: true }),
  ]);
  return true;
}
