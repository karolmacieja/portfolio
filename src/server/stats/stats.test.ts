import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { isBotUserAgent } from "@/lib/bots";

import { dayRange, statsDay } from "./day";

vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));

const BROWSER =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

describe("stats helpers", () => {
  it("uses Polish days and builds day ranges", () => {
    expect(statsDay(new Date("2026-03-01T23:30:00Z"))).toBe("2026-03-02");
    expect(dayRange("2026-03-02", 3)).toEqual(["2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  it("skips bots and empty user agents", () => {
    expect(isBotUserAgent(BROWSER)).toBe(false);
    expect(isBotUserAgent("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
    expect(isBotUserAgent(null)).toBe(true);
  });
});

// Integration: beacon -> daily counts -> roll-up -> owner-scoped report (database, Redis).
describe.skipIf(!process.env.DATABASE_URL || !process.env.REDIS_URL)(
  "site statistics (database)",
  async () => {
    const { db } = await import("@/lib/db");
    const { recordPageView } = await import("./collect");
    const { rollupStats } = await import("./rollup");
    const { getSiteStats } = await import("./service");
    const { createPlanFixtures } = await import("@/server/entitlements/test-utils");
    const plans = createPlanFixtures(db);
    const userIds: string[] = [];
    let analyticsPlan: string;
    let basicPlan: string;

    beforeAll(async () => {
      analyticsPlan = (await plans.createPlan({ features: { analytics: true } })).id;
      basicPlan = (await plans.createPlan()).id;
    });

    afterAll(async () => {
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await plans.cleanup();
    });

    async function createSite(planId: string) {
      const user = await db.user.create({ data: { email: `st-${randomUUID().slice(0, 8)}@test.local` } });
      userIds.push(user.id);
      await plans.subscribe(user.id, planId);
      const slug = `t-st-${randomUUID().slice(0, 8)}`;
      const site = await db.site.create({
        data: { ownerId: user.id, name: "S", slug, publishedAt: new Date() },
      });
      for (const path of ["", "projekty"]) {
        await db.page.create({
          data: {
            siteId: site.id,
            path,
            title: path || "Home",
            draftContent: {},
            publishedContent: {},
            publishedAt: new Date(),
          },
        });
      }
      return { user, site, host: `${slug}.localhost` };
    }

    it("counts views and daily unique visitors, then rolls visitors up", async () => {
      const { user, site, host } = await createSite(analyticsPlan);
      const yesterday = new Date(Date.now() - 86_400_000);
      const view = (path: string, ip: string, now?: Date) =>
        recordPageView({ host, path, ip, userAgent: BROWSER, ...(now ? { now } : {}) });

      expect(await view("", "198.51.100.1")).toBe(true);
      expect(await view("projekty", "198.51.100.1")).toBe(true);
      expect(await view("", "198.51.100.2")).toBe(true);
      expect(await view("", "198.51.100.3", yesterday)).toBe(true);
      expect(await view("missing", "198.51.100.1")).toBe(false);
      expect(await recordPageView({ host, path: "", ip: "1.1.1.1", userAgent: "Googlebot/2.1" })).toBe(false);

      let stats = await getSiteStats(user.id, site.id, 30);
      expect(stats.totals).toEqual({ views: 4, visitors: 3 });
      expect(stats.topPages[0]).toEqual({ path: "", views: 3 });

      await rollupStats();
      expect(
        await db.siteDailyVisitor.count({
          where: { siteId: site.id, day: { lt: new Date(statsDay(new Date())) } },
        }),
      ).toBe(0);
      stats = await getSiteStats(user.id, site.id, 30);
      expect(stats.totals).toEqual({ views: 4, visitors: 3 });
    });

    it("ignores sites without the analytics feature and stays owner-scoped", async () => {
      const { host } = await createSite(basicPlan);
      expect(await recordPageView({ host, path: "", ip: "198.51.100.9", userAgent: BROWSER })).toBe(false);
      const other = await createSite(analyticsPlan);
      const stranger = await createSite(analyticsPlan);
      await expect(getSiteStats(stranger.user.id, other.site.id)).rejects.toMatchObject({ code: "notFound" });
    });
  },
);
