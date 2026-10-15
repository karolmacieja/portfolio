import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

// Integration: finance report and usage snapshots read real records (database). Other tests share the
// database, so assertions compare deltas around our own data.
describe.skipIf(!process.env.DATABASE_URL)("finance and usage (database)", async () => {
  const { db } = await import("@/lib/db");
  const { getFinanceReport } = await import("./load");
  const { takeUsageSnapshot, getClientUsage } = await import("./usage");
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("counts this month's paid revenue by source and its net profit", async () => {
    const before = await getFinanceReport();
    const user = await db.user.create({ data: { email: `fin-${run}@test.local` } });
    userIds.push(user.id);
    await db.payment.create({
      data: {
        userId: user.id,
        kind: "LICENSE",
        status: "PAID",
        amount: 12_300,
        providerPaymentId: `in_fin_${run}`,
        description: "Licencja",
        paidAt: new Date(),
      },
    });
    const after = await getFinanceReport();
    const month = (r: typeof after) => r.history.at(-1)!;
    expect(month(after).bySource.LICENSE - month(before).bySource.LICENSE).toBe(12_300);
    expect(month(after).gross - month(before).gross).toBe(12_300);
    expect(month(after).profit).toBeLessThan(month(before).profit + 12_300);
    expect(after.forecast).toHaveLength(12);
  });

  it("stores a daily usage snapshot and reports one client's usage", async () => {
    await takeUsageSnapshot();
    const latest = await db.usageSnapshot.findFirstOrThrow({ orderBy: { day: "desc" } });
    expect(latest.databaseBytes).toBeGreaterThan(0n);
    const user = await db.user.create({ data: { email: `use-${run}@test.local` } });
    userIds.push(user.id);
    await db.site.create({
      data: { ownerId: user.id, name: "U", slug: `t-use-${run}`, publishedAt: new Date() },
    });
    expect(await getClientUsage(user.id)).toMatchObject({
      sites: 1,
      published: 1,
      views30: 0,
      messages30: 0,
    });
  });
});
