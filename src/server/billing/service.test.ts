import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integration tests: billing profile rules, checkout guards, one trial per user, owner scoping (database).
describe.skipIf(!process.env.DATABASE_URL)("billing service (database)", async () => {
  const { db } = await import("@/lib/db");
  const service = await import("./service");
  const { MockPaymentProvider } = await import("@/server/payments");
  const { createPlanFixtures } = await import("@/server/entitlements/test-utils");
  const plans = createPlanFixtures(db);

  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let priceId: string;

  const person = {
    type: "PERSON" as const,
    fullName: "Jan Test",
    companyName: null,
    taxId: null,
    euVatId: null,
    line1: "Testowa 1",
    line2: null,
    postalCode: "00-001",
    city: "Warszawa",
    country: "pl",
  };

  async function createUser(name: string, options: { verified?: boolean; profile?: boolean } = {}) {
    const user = await db.user.create({
      data: {
        email: `${name}-${run}@test.local`,
        emailVerified: options.verified === false ? null : new Date(),
      },
    });
    userIds.push(user.id);
    if (options.profile !== false) await service.saveBillingProfile(user.id, person);
    return user.id;
  }

  function tokenOf(url: string) {
    const token = MockPaymentProvider.readToken(new URL(url).searchParams.get("token") ?? "");
    if (token?.kind !== "subscription") throw new Error("Expected a subscription checkout token");
    return token;
  }

  beforeAll(async () => {
    const plan = await plans.createPlan({ isActive: true, trialDays: 14, position: 999 });
    priceId = (await db.planPrice.create({ data: { planId: plan.id, interval: "MONTH", amount: 1900 } })).id;
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.planPrice.deleteMany({ where: { id: priceId } });
    await plans.cleanup();
  });

  it("validates the Polish NIP for companies and stores the normalized value", async () => {
    const userId = await createUser("nip", { profile: false });
    const company = { ...person, type: "COMPANY" as const, companyName: "Firma" };
    await expect(
      service.saveBillingProfile(userId, { ...company, taxId: "123-456-78-90" }),
    ).rejects.toMatchObject({
      code: "taxIdInvalid",
    });
    const saved = await service.saveBillingProfile(userId, { ...company, taxId: "526-000-12-46" });
    expect(saved).toMatchObject({ taxId: "5260001246", country: "PL", reverseCharge: false });
  });

  it("marks verified EU VAT ids for reverse charge and refuses Polish ones", async () => {
    const userId = await createUser("vat", { profile: false });
    const company = { ...person, type: "COMPANY" as const, companyName: "GmbH", country: "DE" };
    await expect(
      service.saveBillingProfile(userId, { ...company, euVatId: "PL5260001246" }),
    ).rejects.toMatchObject({
      code: "euVatIdInvalid",
    });
    const saved = await service.saveBillingProfile(userId, { ...company, euVatId: "de 123456789" });
    expect(saved).toMatchObject({ euVatId: "DE123456789", reverseCharge: true });
  });

  it("requires a verified email and a billing profile before checkout", async () => {
    const unverified = await createUser("unverified", { verified: false });
    await expect(
      service.startSubscriptionCheckout(unverified, { priceId, couponCode: null }),
    ).rejects.toMatchObject({
      code: "emailNotVerified",
    });
    const noProfile = await createUser("noprofile", { profile: false });
    await expect(
      service.startSubscriptionCheckout(noProfile, { priceId, couponCode: null }),
    ).rejects.toMatchObject({
      code: "billingProfileRequired",
    });
  });

  it("grants the trial once per user and refuses a second subscription", async () => {
    const userId = await createUser("trial");
    const first = tokenOf(await service.startSubscriptionCheckout(userId, { priceId, couponCode: null }));
    expect(first).toMatchObject({ trialDays: 14, metadata: { userId, priceId } });

    const provider = (await import("./provider")).getPaymentProvider() as InstanceType<
      typeof MockPaymentProvider
    >;
    await provider.completeCheckout(first);
    await expect(
      service.startSubscriptionCheckout(userId, { priceId, couponCode: null }),
    ).rejects.toMatchObject({
      code: "alreadySubscribed",
    });

    await db.subscription.updateMany({ where: { userId }, data: { status: "CANCELED" } });
    const second = tokenOf(await service.startSubscriptionCheckout(userId, { priceId, couponCode: null }));
    expect(second.trialDays).toBe(0);
  });

  it("rejects unknown and exhausted coupons", async () => {
    const userId = await createUser("coupon");
    await expect(
      service.startSubscriptionCheckout(userId, { priceId, couponCode: `NOPE-${run}` }),
    ).rejects.toMatchObject({ code: "couponInvalid" });
    const code = `T${run}`.toUpperCase();
    await db.coupon.create({
      data: {
        code,
        name: "Test",
        percentOff: 10,
        duration: "ONCE",
        maxRedemptions: 1,
        timesRedeemed: 1,
        providerPromotionCodeId: "promo",
      },
    });
    try {
      await expect(
        service.startSubscriptionCheckout(userId, { priceId, couponCode: code }),
      ).rejects.toMatchObject({
        code: "couponInvalid",
      });
    } finally {
      await db.coupon.delete({ where: { code } });
    }
  });

  it("only manages the caller's own subscription", async () => {
    const owner = await createUser("owner");
    const other = await createUser("other");
    const provider = (await import("./provider")).getPaymentProvider() as InstanceType<
      typeof MockPaymentProvider
    >;
    await provider.completeCheckout(
      tokenOf(await service.startSubscriptionCheckout(owner, { priceId, couponCode: null })),
    );

    await expect(service.setCancelAtPeriodEnd(other, true)).rejects.toMatchObject({ code: "noSubscription" });
    await expect(service.changePlan(other, priceId)).rejects.toMatchObject({ code: "noSubscription" });
    await expect(service.createPortalUrl(other)).rejects.toMatchObject({ code: "noSubscription" });

    await service.setCancelAtPeriodEnd(owner, true);
    const subscription = await db.subscription.findFirstOrThrow({ where: { userId: owner } });
    expect(subscription.cancelAtPeriodEnd).toBe(true);
  });
});
