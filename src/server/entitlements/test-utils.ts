import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Test helpers: creates an inactive plan (so it never becomes the entry plan for other tests)
 * and grants users subscriptions to it. Call `cleanup` after deleting the test users.
 */
export function createPlanFixtures(db: PrismaClient) {
  const planIds: string[] = [];

  async function createPlan(overrides: Partial<Prisma.PlanUncheckedCreateInput> = {}) {
    const plan = await db.plan.create({
      data: {
        slug: `test-${randomUUID().slice(0, 8)}`,
        name: "Test plan",
        isActive: false,
        maxSites: 10,
        maxPagesPerSite: 50,
        maxProjects: null,
        storageMb: 1000,
        features: {},
        accessTiers: ["basic", "pro", "business"],
        ...overrides,
      },
    });
    planIds.push(plan.id);
    return plan;
  }

  async function subscribe(
    userId: string,
    planId: string,
    status: "ACTIVE" | "TRIALING" | "CANCELED" = "ACTIVE",
  ) {
    // Only one plan at a time in tests: end previous subscriptions.
    await db.subscription.updateMany({
      where: { userId, status: { not: "CANCELED" } },
      data: { status: "CANCELED" },
    });
    return db.subscription.create({ data: { userId, planId, status } });
  }

  async function cleanup() {
    await db.subscription.deleteMany({ where: { planId: { in: planIds } } });
    await db.plan.deleteMany({ where: { id: { in: planIds } } });
  }

  return { createPlan, subscribe, cleanup };
}
