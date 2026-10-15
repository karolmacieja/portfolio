import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MockMailer } from "@/server/mail/mock";

import { searchName } from "./purchase";
import { MockHostnameProvider } from "./providers/mock-hostnames";
import { MockRegistrar } from "./providers/mock-registrar";
import type { RegistrationDeps } from "./registration";

describe("searchName", () => {
  it("turns free text and pasted domains into a searchable name", () => {
    expect(searchName("Jan Kowalski")).toEqual({ name: "jan-kowalski", extension: null });
    expect(searchName("https://www.jan.com.pl/")).toEqual({ name: "jan", extension: "com.pl" });
    expect(searchName("żółw")).toEqual({ name: "xn--w-uga1v8h", extension: null });
    expect(searchName("-bad-")).toBeNull();
  });
});

// Integration: purchase -> payment events -> registration -> connection -> renewals (database, mocks).
describe.skipIf(!process.env.DATABASE_URL)("domain purchase (database)", async () => {
  const { db } = await import("@/lib/db");
  const purchase = await import("./purchase");
  const registration = await import("./registration");
  const { handleBillingEvent } = await import("@/server/billing/events");
  const { MockPaymentProvider } = await import("@/server/payments");
  const { getPaymentProvider } = await import("@/server/billing/provider");
  const { createPlanFixtures } = await import("@/server/entitlements/test-utils");
  const plans = createPlanFixtures(db);

  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const eventIds: string[] = [];
  let business: string;
  let mailer: MockMailer;
  let now: Date;
  let jobs: { name: string; orderId: string }[];

  const registrant = {
    type: "PERSON" as const,
    firstName: "Jan",
    lastName: "Kowalski",
    companyName: null,
    taxId: null,
    email: "jan@example.com",
    phone: { countryCode: "+48", number: "600100200" },
    street: "Polna 1",
    postalCode: "00-001",
    city: "Warszawa",
    country: "PL",
  };

  const deps = (): RegistrationDeps => ({
    hostnames: new MockHostnameProvider(),
    registrar: new MockRegistrar(),
    nameservers: ["ns1.example"],
    env: {
      CUSTOM_DOMAIN_CNAME_TARGET: "sites.example.test",
      ROOT_DOMAIN: "example.test",
      CUSTOM_DOMAIN_APEX_IPS: [],
    },
    invalidate: () => {},
    mailer,
    brand: "Test",
    panelUrl: "http://app.test/dashboard",
    enqueue: (job) => void jobs.push(job),
    now: () => now,
  });

  async function createBuyer(planId: string | null) {
    const user = await db.user.create({
      data: {
        email: `buy-${randomUUID().slice(0, 8)}-${run}@test.local`,
        emailVerified: new Date(),
        billingProfile: {
          create: {
            type: "PERSON",
            fullName: "Jan Kowalski",
            line1: "Polna 1",
            postalCode: "00-001",
            city: "Warszawa",
          },
        },
      },
    });
    userIds.push(user.id);
    if (planId) await plans.subscribe(user.id, planId);
    const site = await db.site.create({
      data: { ownerId: user.id, name: "S", slug: `t-buy-${randomUUID().slice(0, 8)}` },
    });
    return { userId: user.id, siteId: site.id };
  }

  async function pay(url: string) {
    const token = MockPaymentProvider.readToken(new URL(url).searchParams.get("token") ?? "");
    if (!token) throw new Error("no token");
    await (getPaymentProvider() as InstanceType<typeof MockPaymentProvider>).completeCheckout(token);
    return token;
  }

  beforeAll(async () => {
    business = (await plans.createPlan({ features: { customDomain: true, domainPurchase: true } })).id;
  });

  beforeEach(() => {
    mailer = new MockMailer(() => {});
    now = new Date();
    jobs = [];
  });

  afterAll(async () => {
    await db.invoice.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.webhookEvent.deleteMany({ where: { id: { in: eventIds } } });
    await plans.cleanup();
  });

  it("requires the domainPurchase feature and prices offered extensions", async () => {
    const free = await createBuyer(null);
    await expect(purchase.searchDomains(free.userId, "jan")).rejects.toMatchObject({
      code: "purchaseNotAllowed",
    });

    const buyer = await createBuyer(business);
    const offers = await purchase.searchDomains(buyer.userId, `jan-${run}.com.pl`);
    expect(offers[0]).toEqual({ domain: `jan-${run}.com.pl`, available: true, price: 5600 });
    expect(offers.map((o) => o.domain.split(".").slice(1).join("."))).toEqual([
      "com.pl",
      "pl",
      "com",
      "art.pl",
      "info.pl",
    ]);
    expect((await purchase.searchDomains(buyer.userId, `zajeta-${run}`)).every((o) => !o.available)).toBe(
      true,
    );
  });

  it("registers a paid domain, connects www to the site and invoices the payment", async () => {
    const { userId, siteId } = await createBuyer(business);
    const domain = `kup-${run}.pl`;
    await expect(
      purchase.startDomainPurchase(userId, { siteId, domain: `zajeta-${run}.pl`, registrant }),
    ).rejects.toMatchObject({ code: "notAvailable" });

    const url = await purchase.startDomainPurchase(userId, { siteId, domain, registrant });
    const token = await pay(url);
    const order = await db.domainOrder.findUniqueOrThrow({ where: { id: token.metadata.orderId } });
    expect(order).toMatchObject({ status: "REGISTERING", priceAmount: 6800, autoRenew: true });
    expect(order.providerSubscriptionId).toMatch(/^mock_sub_/);
    // Domain subscriptions never become plan subscriptions.
    expect(await db.subscription.count({ where: { userId } })).toBe(1);
    expect(await db.payment.findFirstOrThrow({ where: { domainOrderId: order.id } })).toMatchObject({
      kind: "DOMAIN",
      status: "PAID",
      amount: 6800,
      description: `Domena ${domain} (1 rok)`,
    });
    expect(await db.invoice.count({ where: { payment: { domainOrderId: order.id } } })).toBe(1);

    await registration.registerDomain(order.id, deps());
    expect(await db.domainOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: "ACTIVE",
      registrarDomainId: `mock_dom_${domain}`,
    });
    expect(
      await db.domain.findMany({
        where: { orderId: order.id },
        select: { hostname: true, type: true, isPrimary: true },
      }),
    ).toEqual([{ hostname: `www.${domain}`, type: "PURCHASED", isPrimary: true }]);
    expect(mailer.sent.at(-1)!.subject).toContain(`Domena ${domain} została zarejestrowana`);

    // Auto-renewal off/on goes through the subscription.
    await purchase.setDomainAutoRenew(userId, order.id, false);
    expect((await db.domainOrder.findUniqueOrThrow({ where: { id: order.id } })).autoRenew).toBe(false);
    expect(await purchase.getDomainAuthCode(userId, order.id)).toEqual(expect.any(String));

    const other = await createBuyer(business);
    await expect(purchase.getDomainAuthCode(other.userId, order.id)).rejects.toMatchObject({
      code: "notFound",
    });
    await expect(purchase.setDomainAutoRenew(other.userId, order.id, true)).rejects.toMatchObject({
      code: "notFound",
    });
  });

  it("renews after a renewal payment, reminds before expiry and expires without auto-renewal", async () => {
    const { userId, siteId } = await createBuyer(business);
    const domain = `odn-${run}.pl`;
    const token = await pay(await purchase.startDomainPurchase(userId, { siteId, domain, registrant }));
    const orderId = token.metadata.orderId!;
    await registration.registerDomain(orderId, deps());
    const registered = await db.domainOrder.findUniqueOrThrow({ where: { id: orderId } });

    // Renewal payment through the same event path as Stripe (another yearly invoice).
    const id = `test_evt_${run}_${eventIds.length}`;
    eventIds.push(id);
    await handleBillingEvent(
      {
        id,
        type: "invoice.paid",
        invoice: {
          id: `in_${randomUUID()}`,
          customerId: null,
          subscriptionId: registered.providerSubscriptionId,
          amountPaid: 6800,
          amountDue: 6800,
          currency: "PLN",
          description: "renewal",
          paymentRef: `pi_${randomUUID()}`,
          subscriptionMetadata: { kind: "domain", userId, orderId },
        },
      },
      "test",
      {
        invalidate: () => {},
        mailer,
        brand: "Test",
        billingUrl: "http://app.test/billing",
        enqueueInvoice: () => {},
        enqueueDomainJob: (job) => void jobs.push(job),
      },
    );
    expect(jobs).toEqual([{ name: "renew", orderId }]);
    now = new Date(now.getTime() + 40 * 86_400_000);
    await registration.renewDomain(orderId, deps());
    const renewed = await db.domainOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(renewed.expiresAt!.getTime() - registered.expiresAt!.getTime()).toBeGreaterThan(360 * 86_400_000);

    // Reminders: 30 days before expiry, once.
    now = new Date(renewed.expiresAt!.getTime() - 20 * 86_400_000);
    await registration.domainMaintenance(deps());
    await registration.domainMaintenance(deps());
    expect(mailer.sent.filter((m) => m.subject.includes("wygasa za"))).toHaveLength(1);

    await db.domainOrder.update({ where: { id: orderId }, data: { autoRenew: false } });
    now = new Date(renewed.expiresAt!.getTime() + 86_400_000);
    await registration.domainMaintenance(deps());
    expect((await db.domainOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("EXPIRED");
  });

  it("leaves rejected registrations for manual review", async () => {
    const { userId, siteId } = await createBuyer(business);
    const token = await pay(
      await purchase.startDomainPurchase(userId, { siteId, domain: `odrzucona-${run}.pl`, registrant }),
    );
    await registration.registerDomain(token.metadata.orderId!, deps());
    expect(await db.domainOrder.findUniqueOrThrow({ where: { id: token.metadata.orderId } })).toMatchObject({
      status: "FAILED",
      lastError: expect.stringContaining("rejected"),
    });
  });
});
