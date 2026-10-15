import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

// Integration: reports -> decisions with reasons -> suspension and restore (database, mock mailer).
describe.skipIf(!process.env.DATABASE_URL)("moderation (database)", async () => {
  const { db } = await import("@/lib/db");
  const moderation = await import("./service");
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  async function createSite() {
    const user = await db.user.create({
      data: { email: `mod-${randomUUID().slice(0, 8)}-${run}@test.local` },
    });
    userIds.push(user.id);
    return db.site.create({
      data: {
        ownerId: user.id,
        name: "S",
        slug: `t-mod-${randomUUID().slice(0, 8)}`,
        publishedAt: new Date(),
      },
    });
  }
  const report = (siteId: string) =>
    moderation.submitReport({
      siteId,
      path: "https://example.test/",
      category: "COPYRIGHT",
      description: "Copied photos from my portfolio",
      reporterEmail: null,
      ip: "203.0.113.7",
    });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("stores reports with a hashed IP only", async () => {
    const site = await createSite();
    const created = await report(site.id);
    expect(created.reporterHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(created)).not.toContain("203.0.113.7");
    await expect(report("missing")).rejects.toMatchObject({ code: "notFound" });
  });

  it("suspending on a report resolves the site's open reports and keeps the reason", async () => {
    const site = await createSite();
    const [first] = [await report(site.id), await report(site.id)];
    const { tags } = await moderation.resolveReport(
      "staff",
      first.id,
      "suspend",
      "Naruszenie praw autorskich",
    );
    expect(tags).toEqual([`site:${site.id}`]);
    expect(await db.site.findUniqueOrThrow({ where: { id: site.id } })).toMatchObject({
      status: "SUSPENDED",
      suspensionReason: "MODERATION",
      suspensionNote: "Naruszenie praw autorskich",
    });
    expect(await db.abuseReport.count({ where: { siteId: site.id, status: "OPEN" } })).toBe(0);
    await expect(moderation.resolveReport("staff", first.id, "dismiss", "x")).rejects.toMatchObject({
      code: "alreadyResolved",
    });

    await moderation.moderateSite(site.id, false, "Treści usunięte");
    expect(await db.site.findUniqueOrThrow({ where: { id: site.id } })).toMatchObject({
      status: "ACTIVE",
      suspensionNote: null,
    });
  });

  it("never lifts payment suspensions through moderation", async () => {
    const site = await createSite();
    await db.site.update({
      where: { id: site.id },
      data: { status: "SUSPENDED", suspensionReason: "PAYMENT" },
    });
    await expect(moderation.moderateSite(site.id, false, "Przywrócenie")).rejects.toMatchObject({
      code: "notModerated",
    });
  });
});
