import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MockMailer } from "@/server/mail/mock";
import type { BillingEvent, ProviderSubscription } from "@/server/payments/types";

import type { BillingDeps } from "./deps";

// Integration tests: provider events -> subscriptions, payments, dunning and site suspension (database).
describe.skipIf(!process.env.DATABASE_URL)("billing events and dunning (database)", async () => {
  const { db } = await import("@/lib/db");
  const { handleBillingEvent } = await import("./events");
  const { runDunning, DUNNING_SUSPENDED } = await import("./dunning");
  const { createPlanFixtures } = await import("@/server/entitlements/test-utils");
  const { getEntitlements } = await import("@/server/entitlements");
  const plans = createPlanFixtures(db);

  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const eventIds: string[] = [];
  let mailer: MockMailer;
  let invalidated: string[];
  let now: Date;
  let deps: BillingDeps;
  let price: { id: string; planId: string };

  const evt = (suffix: string) => {
    const id = `test_evt_${run}_${suffix}_${eventIds.length}`;
    eventIds.push(id);
    return id;
  };

  async function createUser(name: string) {
    const user = await db.user.create({
      data: { email: `${name}-${run}@test.local`, emailVerified: new Date() },
    });
    userIds.push(user.id);
    return user.id;
  }

  function subscription(userId: string, patch: Partial<ProviderSubscription> = {}): ProviderSubscription {
    return {
      id: `sub_${userId}`,
      customerId: `cus_${userId}`,
      status: "ACTIVE",
      priceRef: price.id,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
      trialEnd: null,
      metadata: { userId, planId: price.planId, priceId: price.id },
      ...patch,
    };
  }

  const invoiceEvent = (
    userId: string,
    type: "invoice.paid" | "invoice.payment_failed",
    amount = 3900,
  ): BillingEvent => ({
    id: evt(type),
    type,
    invoice: {
      id: `in_${randomUUID()}`,
      customerId: `cus_${userId}`,
      subscriptionId: `sub_${userId}`,
      amountPaid: type === "invoice.paid" ? amount : 0,
      amountDue: amount,
      currency: "PLN",
      description: "Pro (1 mies.)",
    },
  });

  beforeAll(async () => {
    const plan = await plans.createPlan({ features: { removeBranding: true } });
    price = await db.planPrice.create({ data: { planId: plan.id, interval: "MONTH", amount: 3900 } });
  });

  beforeEach(() => {
    mailer = new MockMailer(() => {});
    invalidated = [];
    now = new Date("2026-10-01T10:00:00Z");
    deps = {
      invalidate: (tags) => void invalidated.push(...tags),
      mailer,
      brand: "Test",
      billingUrl: "http://app.test/billing",
      now: () => now,
    };
  });

  afterAll(async () => {
    await db.webhookEvent.deleteMany({ where: { id: { in: eventIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await plans.cleanup();
  });

  it("creates the subscription from events in any order and replaces a manual subscription", async () => {
    const userId = await createUser("order");
    await plans.subscribe(userId, price.planId); // manual (no provider id)

    // Stripe sends customer.subscription.created before checkout.session.completed.
    await handleBillingEvent(
      { id: evt("sub"), type: "subscription.updated", subscription: subscription(userId) },
      "test",
      deps,
    );
    await handleBillingEvent(
      {
        id: evt("checkout"),
        type: "checkout.completed",
        sessionId: `cs_${run}`,
        mode: "subscription",
        customerId: `cus_${userId}`,
        subscriptionId: `sub_${userId}`,
        amountTotal: 3900,
        currency: "PLN",
        metadata: { userId, planId: price.planId, priceId: price.id },
      },
      "test",
      deps,
    );

    const subs = await db.subscription.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    expect(subs.map((s) => [s.providerSubscriptionId, s.status])).toEqual([
      [null, "CANCELED"],
      [`sub_${userId}`, "ACTIVE"],
    ]);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).billingCustomerId).toBe(
      `cus_${userId}`,
    );
    expect((await getEntitlements(userId)).canPublish).toBe(true);
  });

  it("is idempotent per event id", async () => {
    const userId = await createUser("idem");
    const event: BillingEvent = {
      id: evt("dup"),
      type: "subscription.updated",
      subscription: subscription(userId),
    };
    expect(await handleBillingEvent(event, "test", deps)).toEqual({ processed: true });
    expect(await handleBillingEvent(event, "test", deps)).toEqual({ processed: false });
  });

  it("records paid invoices but not zero-amount ones", async () => {
    const userId = await createUser("paid");
    await handleBillingEvent(
      { id: evt("sub"), type: "subscription.updated", subscription: subscription(userId) },
      "test",
      deps,
    );
    await handleBillingEvent(invoiceEvent(userId, "invoice.paid"), "test", deps);
    await handleBillingEvent(invoiceEvent(userId, "invoice.paid", 0), "test", deps);
    const payments = await db.payment.findMany({ where: { userId } });
    expect(payments.map((p) => [p.status, p.amount, p.kind])).toEqual([["PAID", 3900, "SUBSCRIPTION"]]);
  });

  it("dunning: notice on failure, reminders, suspension after the grace period, restore on payment", async () => {
    const userId = await createUser("dunning");
    const site = await db.site.create({
      data: { ownerId: userId, name: "S", slug: `t-dun-${run}`, publishedAt: now },
    });
    const moderated = await db.site.create({
      data: {
        ownerId: userId,
        name: "M",
        slug: `t-mod-${run}`,
        status: "SUSPENDED",
        suspensionReason: "MODERATION",
      },
    });
    await handleBillingEvent(
      { id: evt("sub"), type: "subscription.updated", subscription: subscription(userId) },
      "test",
      deps,
    );

    await handleBillingEvent(invoiceEvent(userId, "invoice.payment_failed"), "test", deps);
    await handleBillingEvent(
      {
        id: evt("pastdue"),
        type: "subscription.updated",
        subscription: subscription(userId, { status: "PAST_DUE" }),
      },
      "test",
      deps,
    );
    let sub = await db.subscription.findFirstOrThrow({ where: { userId } });
    expect(sub.pastDueSince).toEqual(now);
    expect(sub.dunningStage).toBe(1);
    expect(mailer.sent.map((m) => m.subject)).toEqual(["Nie udało się pobrać płatności — Test"]);
    expect((await getEntitlements(userId)).canPublish).toBe(true); // grace period

    // Day 2: nothing; day 3: first reminder; day 6: second reminder.
    now = new Date(now.getTime() + 2 * 86_400_000);
    expect(await runDunning(deps)).toEqual({ reminders: 0, suspended: 0 });
    now = new Date(now.getTime() + 1 * 86_400_000);
    expect(await runDunning(deps)).toEqual({ reminders: 1, suspended: 0 });
    expect(await runDunning(deps)).toEqual({ reminders: 0, suspended: 0 });
    now = new Date(now.getTime() + 3 * 86_400_000);
    expect(await runDunning(deps)).toEqual({ reminders: 1, suspended: 0 });

    // Day 7: suspension.
    now = new Date(now.getTime() + 1 * 86_400_000);
    expect(await runDunning(deps)).toEqual({ reminders: 0, suspended: 1 });
    sub = await db.subscription.findFirstOrThrow({ where: { userId } });
    expect(sub.dunningStage).toBe(DUNNING_SUSPENDED);
    expect((await db.site.findUniqueOrThrow({ where: { id: site.id } })).status).toBe("SUSPENDED");
    expect(invalidated).toContain(`site:${site.id}`);
    expect(mailer.sent.at(-1)?.subject).toBe("Twoje strony zostały wstrzymane — Test");
    expect(await runDunning(deps)).toEqual({ reminders: 0, suspended: 0 });

    // Payment restores payment-suspended sites only.
    await handleBillingEvent(invoiceEvent(userId, "invoice.paid"), "test", deps);
    expect((await db.site.findUniqueOrThrow({ where: { id: site.id } })).status).toBe("ACTIVE");
    expect((await db.site.findUniqueOrThrow({ where: { id: moderated.id } })).status).toBe("SUSPENDED");
    sub = await db.subscription.findFirstOrThrow({ where: { userId } });
    expect([sub.pastDueSince, sub.dunningStage]).toEqual([null, 0]);
  });

  it("subscription end suspends sites and notifies the user", async () => {
    const userId = await createUser("ended");
    const site = await db.site.create({
      data: { ownerId: userId, name: "S", slug: `t-end-${run}`, publishedAt: now },
    });
    await handleBillingEvent(
      { id: evt("sub"), type: "subscription.updated", subscription: subscription(userId) },
      "test",
      deps,
    );
    await handleBillingEvent(
      {
        id: evt("del"),
        type: "subscription.deleted",
        subscription: subscription(userId, { status: "CANCELED" }),
      },
      "test",
      deps,
    );
    expect((await db.subscription.findFirstOrThrow({ where: { userId } })).status).toBe("CANCELED");
    expect((await db.site.findUniqueOrThrow({ where: { id: site.id } })).suspensionReason).toBe("PAYMENT");
    expect(mailer.sent.map((m) => m.subject)).toEqual(["Twoja subskrypcja wygasła — Test"]);
    expect((await getEntitlements(userId)).canPublish).toBe(false);
  });

  it("a template checkout grants the purchase and records the payment", async () => {
    const userId = await createUser("template");
    const template = await db.template.create({
      data: {
        slug: `t-prem-${run}`,
        name: "Premium",
        category: "other",
        draft: {},
        isPremium: true,
        priceAmount: 4900,
      },
    });
    try {
      await handleBillingEvent(
        {
          id: evt("tpl"),
          type: "checkout.completed",
          sessionId: `cs_tpl_${run}`,
          mode: "payment",
          customerId: `cus_${userId}`,
          subscriptionId: null,
          amountTotal: 4900,
          currency: "PLN",
          metadata: { kind: "template", userId, templateId: template.id },
        },
        "test",
        deps,
      );
      expect(await db.templatePurchase.count({ where: { userId, templateId: template.id } })).toBe(1);
      const payment = await db.payment.findFirstOrThrow({ where: { userId } });
      expect([payment.kind, payment.amount, payment.description]).toEqual([
        "TEMPLATE",
        4900,
        "Szablon: Premium",
      ]);
    } finally {
      await db.template.delete({ where: { id: template.id } });
    }
  });

  it("failed processing releases the event so the provider can retry", async () => {
    const event: BillingEvent = {
      id: evt("bad"),
      type: "subscription.updated",
      subscription: { ...subscription("nobody"), metadata: {} },
    };
    await expect(handleBillingEvent(event, "test", deps)).rejects.toThrow(/unknown user/);
    expect(await db.webhookEvent.count({ where: { id: event.id } })).toBe(0);
  });
});
