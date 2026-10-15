import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

// Integration: plan price history and team role guards (database, mock payments).
describe.skipIf(!process.env.DATABASE_URL)("plan catalog and team (database)", async () => {
  const { db } = await import("@/lib/db");
  const plans = await import("./plans");
  const staff = await import("./staff");
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const planIds: string[] = [];

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.plan.deleteMany({ where: { id: { in: planIds } } });
  });

  it("keeps old prices for existing subscribers when the amount changes", async () => {
    const { id } = await plans.savePlan(null, {
      slug: `t-cat-${run}`,
      name: "Test",
      description: null,
      position: 999,
      isActive: false,
      trialDays: 0,
      maxSites: 1,
      maxPagesPerSite: 1,
      maxProjects: null,
      storageMb: 100,
      features: { customDomain: true } as never,
      accessTiers: ["pro"],
    });
    planIds.push(id);
    expect((await db.plan.findUniqueOrThrow({ where: { id } })).accessTiers).toEqual(["basic", "pro"]);

    const first = await plans.setPlanPrice(id, "MONTH", 1900);
    expect(await plans.setPlanPrice(id, "MONTH", 1900)).toMatchObject({ id: first.id });
    const second = await plans.setPlanPrice(id, "MONTH", 2900);
    const prices = await db.planPrice.findMany({ where: { planId: id }, orderBy: { createdAt: "asc" } });
    expect(prices.map((p) => [p.id, p.amount, p.isActive])).toEqual([
      [first.id, 1900, false],
      [second.id, 2900, true],
    ]);
    await expect(plans.setPlanPrice(id, "YEAR", 50)).rejects.toMatchObject({ code: "invalid" });
  });

  it("never leaves the panel without an administrator and refuses self changes", async () => {
    const admin = await db.user.create({ data: { email: `cat-a-${run}@test.local`, role: "ADMIN" } });
    const other = await db.user.create({ data: { email: `cat-b-${run}@test.local` } });
    userIds.push(admin.id, other.id);
    await expect(staff.setUserRole(admin.id, admin.email, "CLIENT")).rejects.toMatchObject({
      code: "selfAction",
    });
    await staff.setUserRole(admin.id, other.email, "SUPPORT");
    expect((await db.user.findUniqueOrThrow({ where: { id: other.id } })).role).toBe("SUPPORT");

    // With other admins in the database (seed) demoting works; the guard is checked on the count.
    const admins = await db.user.count({ where: { role: "ADMIN", blockedAt: null } });
    if (admins === 1) {
      await expect(staff.setUserRole(other.id, admin.email, "CLIENT")).rejects.toMatchObject({
        code: "lastAdmin",
      });
    } else {
      await staff.setUserRole(other.id, admin.email, "SUPPORT");
    }
  });
});
