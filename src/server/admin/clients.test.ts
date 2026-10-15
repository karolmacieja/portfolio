import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integration tests: staff client management and impersonation tokens (database, mock payments).
describe.skipIf(!process.env.DATABASE_URL)("admin clients (database)", async () => {
  const { db } = await import("@/lib/db");
  const clients = await import("./clients");
  const impersonation = await import("./impersonation");
  const { getEntitlements } = await import("@/server/entitlements");
  const { createPlanFixtures } = await import("@/server/entitlements/test-utils");
  const plans = createPlanFixtures(db);

  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let planId: string;

  async function createUser(role: "CLIENT" | "SUPPORT" | "ADMIN" = "CLIENT") {
    const user = await db.user.create({
      data: { email: `adm-${randomUUID().slice(0, 8)}-${run}@test.local`, name: `Test ${run}`, role },
    });
    userIds.push(user.id);
    return user;
  }

  beforeAll(async () => {
    planId = (await plans.createPlan({ features: { removeBranding: true } })).id;
  });

  afterAll(async () => {
    await db.subscription.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await plans.cleanup();
  });

  it("finds clients by email, site and status", async () => {
    const user = await createUser();
    await db.site.create({ data: { ownerId: user.id, name: "S", slug: `t-adm-${run}` } });
    expect((await clients.listClients({ q: `t-adm-${run}` })).users.map((u) => u.id)).toEqual([user.id]);
    await db.user.update({ where: { id: user.id }, data: { blockedAt: new Date() } });
    expect((await clients.listClients({ q: run, status: "blocked" })).users.map((u) => u.id)).toContain(
      user.id,
    );
  });

  it("grants and revokes manual plans, never over a provider subscription", async () => {
    const user = await createUser();
    await clients.grantPlan(user.id, planId, null);
    expect((await getEntitlements(user.id)).plan?.id).toBe(planId);
    await clients.grantPlan(user.id, planId, new Date(Date.now() + 86_400_000));
    expect(await db.subscription.count({ where: { userId: user.id, status: "ACTIVE" } })).toBe(1);
    await clients.revokeManualPlan(user.id);
    expect((await getEntitlements(user.id)).plan).toBeNull();

    await db.subscription.create({
      data: { userId: user.id, planId, status: "ACTIVE", providerSubscriptionId: `sub_${run}` },
    });
    await expect(clients.grantPlan(user.id, planId, null)).rejects.toMatchObject({
      code: "managedByProvider",
    });
  });

  it("protects staff and self from blocking", async () => {
    const support = await createUser("SUPPORT");
    const admin = await createUser("ADMIN");
    const client = await createUser();
    await expect(
      clients.setClientBlocked({ id: support.id, canManageStaff: false }, support.id, true),
    ).rejects.toMatchObject({
      code: "selfAction",
    });
    await expect(
      clients.setClientBlocked({ id: support.id, canManageStaff: false }, admin.id, true),
    ).rejects.toMatchObject({
      code: "staffOnly",
    });
    await clients.setClientBlocked({ id: support.id, canManageStaff: false }, client.id, true);
    expect((await db.user.findUniqueOrThrow({ where: { id: client.id } })).blockedAt).not.toBeNull();
  });

  it("refunds only paid charges within the remaining amount", async () => {
    const user = await createUser();
    const payment = await db.payment.create({
      data: {
        userId: user.id,
        kind: "TEMPLATE",
        status: "PAID",
        amount: 4900,
        providerPaymentId: `cs_${randomUUID()}`,
        description: "Test",
      },
    });
    await expect(clients.refundPayment(payment.id, 1000)).rejects.toMatchObject({ code: "notRefundable" });
    await db.payment.update({
      where: { id: payment.id },
      data: { providerChargeRef: `mock_pi_${randomUUID()}` },
    });
    await expect(clients.refundPayment(payment.id, 5000)).rejects.toMatchObject({ code: "refundAmount" });
    // The mock provider emits payment.refunded in-process, like a Stripe webhook.
    await clients.refundPayment(payment.id, 1000);
    expect(await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({
      status: "PAID",
      refundedAmount: 1000,
    });
  });

  it("issues single-use impersonation tokens for clients only", async () => {
    const admin = await createUser("SUPPORT");
    const client = await createUser();
    await expect(impersonation.startImpersonation(admin, admin.id, "x")).rejects.toMatchObject({
      code: "selfAction",
    });
    await expect(impersonation.startImpersonation(client, admin.id, "x")).rejects.toMatchObject({
      code: "staffOnly",
    });

    const { url, session } = await impersonation.startImpersonation(admin, client.id, "Ticket 42");
    const token = new URL(url).searchParams.get("token")!;
    expect(await impersonation.describeImpersonationToken(token)).toMatchObject({
      userEmail: client.email,
      reason: "Ticket 42",
    });

    const signedIn = await impersonation.consumeImpersonationToken(token);
    expect(signedIn).toMatchObject({
      id: client.id,
      impersonation: { sessionId: session.id, adminEmail: admin.email },
    });
    expect(await impersonation.consumeImpersonationToken(token)).toBeNull();
    expect(await impersonation.isImpersonationActive(session.id)).toBe(true);
    await impersonation.endImpersonation(session.id);
    expect(await impersonation.isImpersonationActive(session.id)).toBe(false);

    // A staff member who lost the permission (now a client) can't redeem a pending token.
    const second = await impersonation.startImpersonation(admin, client.id, "Ticket 43");
    await db.user.update({ where: { id: admin.id }, data: { role: "CLIENT" } });
    expect(
      await impersonation.consumeImpersonationToken(new URL(second.url).searchParams.get("token")!),
    ).toBeNull();
    expect(await impersonation.consumeImpersonationToken("forged.token")).toBeNull();
  });
});
