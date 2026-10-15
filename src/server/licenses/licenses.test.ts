import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MockMailer } from "@/server/mail/mock";
import type { BillingEvent } from "@/server/payments/types";

import type { BillingDeps } from "@/server/billing/deps";

vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn, revalidateTag: () => {} }));

// Integration: license payments -> seats -> joining -> entitlements, sponsor footer and its removal (database).
describe.skipIf(!process.env.DATABASE_URL || !process.env.REDIS_URL)(
  "group licenses (database)",
  async () => {
    const { db } = await import("@/lib/db");
    const { handleBillingEvent } = await import("@/server/billing/events");
    const service = await import("./service");
    const admin = await import("./admin");
    const { expireManualLicenses } = await import("./maintenance");
    const { getEntitlements } = await import("@/server/entitlements");
    const { sponsorOf } = await import("@/server/sites/public");
    const { createPlanFixtures } = await import("@/server/entitlements/test-utils");
    const plans = createPlanFixtures(db);
    const run = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const eventIds: string[] = [];
    const mailer = new MockMailer(() => {});
    const deps: BillingDeps = {
      invalidate: () => {},
      mailer,
      brand: "Folio",
      billingUrl: "http://app.localhost:3000/billing",
      enqueueInvoice: () => {},
      enqueueDomainJob: () => {},
    };
    let planId: string;

    const event = (e: Record<string, unknown>) => {
      const id = `test_evt_${run}_${eventIds.length}`;
      eventIds.push(id);
      return handleBillingEvent({ id, ...e } as BillingEvent, "test", deps);
    };

    async function createUser(name: string) {
      const user = await db.user.create({
        data: { email: `${name}-${run}@test.local`, emailVerified: new Date() },
      });
      userIds.push(user.id);
      return user;
    }

    async function createLicense(managerId: string, seats = 2) {
      return db.organization.create({
        data: {
          name: `Szkoła ${run}`,
          planId,
          seats,
          source: "STRIPE",
          interval: "MONTH",
          seatPrice: 1500,
          managerId,
          sponsorName: "Fundacja Test",
          sponsorUrl: "https://fundacja.example",
          joinCode: `code-${randomUUID()}`,
          members: { create: { userId: managerId, role: "MANAGER" } },
        },
      });
    }

    beforeAll(async () => {
      planId = (await plans.createPlan({ position: 5, features: { analytics: true } })).id;
    });

    afterAll(async () => {
      await db.organization.deleteMany({ where: { members: { some: { userId: { in: userIds } } } } });
      await db.organization.deleteMany({ where: { managerId: { in: userIds } } });
      await db.webhookEvent.deleteMany({ where: { id: { in: eventIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await plans.cleanup();
    });

    it("activates a paid license, records the payment and grants the plan to members", async () => {
      const manager = await createUser("manager");
      const org = await createLicense(manager.id, 2);
      const metadata = { kind: "license", organizationId: org.id, userId: manager.id };
      const sub = `sub_lic_${run}`;
      await event({
        type: "checkout.completed",
        sessionId: `cs_${run}`,
        mode: "subscription",
        customerId: null,
        subscriptionId: sub,
        amountTotal: 3000,
        currency: "PLN",
        paymentRef: null,
        metadata,
      });
      await event({
        type: "subscription.updated",
        subscription: {
          id: sub,
          customerId: "",
          status: "ACTIVE",
          priceRef: null,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
          trialEnd: null,
          metadata,
          quantity: 2,
        },
      });
      await event({
        type: "invoice.paid",
        invoice: {
          id: `in_lic_${run}`,
          customerId: null,
          subscriptionId: sub,
          amountPaid: 3000,
          amountDue: 3000,
          currency: "PLN",
          description: "Licencja",
          paymentRef: `pi_${run}`,
          subscriptionMetadata: metadata,
        },
      });
      expect(await db.organization.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({
        status: "ACTIVE",
        providerSubscriptionId: sub,
      });
      expect(await db.payment.findFirstOrThrow({ where: { organizationId: org.id } })).toMatchObject({
        kind: "LICENSE",
        userId: manager.id,
        amount: 3000,
      });
      expect(await getEntitlements(manager.id)).toMatchObject({
        source: "license",
        canPublish: true,
        plan: { id: planId },
      });

      // Seats: one free seat left after the manager; the link lets one member in, the next one is refused.
      const member = await createUser("member");
      await service.joinOrganization(member.id, { code: org.joinCode });
      expect((await getEntitlements(member.id)).license?.id).toBe(org.id);
      const extra = await createUser("extra");
      await expect(service.joinOrganization(extra.id, { code: org.joinCode })).rejects.toMatchObject({
        code: "noSeats",
      });

      // Seat change reported by the provider.
      await event({
        type: "subscription.updated",
        subscription: {
          id: sub,
          customerId: "",
          status: "ACTIVE",
          priceRef: null,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
          trialEnd: null,
          metadata,
          quantity: 5,
        },
      });
      expect((await db.organization.findUniqueOrThrow({ where: { id: org.id } })).seats).toBe(5);

      // The sponsor footer shows for members until they pay to remove it (one-time).
      const owner = async (userId: string) =>
        db.user.findUniqueOrThrow({
          where: { id: userId },
          select: {
            membership: { select: { sponsorFooterHidden: true, organization: true } },
            sponsorRemoval: { select: { status: true } },
          },
        });
      expect(sponsorOf(await owner(member.id))).toEqual({
        name: "Fundacja Test",
        url: "https://fundacja.example",
      });
      await event({
        type: "checkout.completed",
        sessionId: `cs_rm_${run}`,
        mode: "payment",
        customerId: null,
        subscriptionId: null,
        amountTotal: 4900,
        currency: "PLN",
        paymentRef: `pi_rm_${run}`,
        metadata: { kind: "sponsor-removal", userId: member.id },
      });
      expect(sponsorOf(await owner(member.id))).toBeNull();
      expect(await db.payment.count({ where: { userId: member.id, kind: "ADDON" } })).toBe(1);

      // Staff can hide the footer for one member for free.
      await admin.setMemberSponsorHidden(org.id, manager.id, true);
      expect(sponsorOf(await owner(manager.id))).toBeNull();

      // Cancelled license: members without their own plan lose publishing.
      await event({
        type: "subscription.deleted",
        subscription: {
          id: sub,
          customerId: "",
          status: "CANCELED",
          priceRef: null,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
          trialEnd: null,
          metadata,
        },
      });
      expect((await getEntitlements(member.id)).canPublish).toBe(false);
      expect(mailer.sent.some((mail) => mail.to === member.email)).toBe(true);
    });

    it("lets a member keep a better plan of their own, and only invited addresses use invitations", async () => {
      const manager = await createUser("mgr2");
      const org = await createLicense(manager.id, 10);
      await db.organization.update({
        where: { id: org.id },
        data: { status: "ACTIVE", joinLinkEnabled: false },
      });
      const invited = await createUser("invited");
      const other = await createUser("other");
      await expect(service.joinOrganization(invited.id, { code: org.joinCode })).rejects.toMatchObject({
        code: "joinLinkDisabled",
      });

      const token = "t".repeat(32) + run;
      const { createHash } = await import("node:crypto");
      await db.organizationInvite.create({
        data: {
          organizationId: org.id,
          email: invited.email,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      await expect(service.joinOrganization(other.id, { invite: token })).rejects.toMatchObject({
        code: "inviteEmailMismatch",
      });
      await service.joinOrganization(invited.id, { invite: token });
      await expect(service.joinOrganization(invited.id, { invite: token })).rejects.toMatchObject({
        code: "inviteInvalid",
      });

      const better = await plans.createPlan({ position: 9 });
      await plans.subscribe(invited.id, better.id);
      expect(await getEntitlements(invited.id)).toMatchObject({
        source: "subscription",
        plan: { id: better.id },
        license: { id: org.id },
      });

      await service.leaveOrganization(invited.id);
      expect((await getEntitlements(invited.id)).license).toBeNull();
      await expect(service.leaveOrganization(manager.id)).rejects.toMatchObject({
        code: "managerCannotLeave",
      });
    });

    it("creates manual licenses and expires them at their end date", async () => {
      const manager = await createUser("manual");
      const org = await admin.createManualLicense({
        name: `Uczelnia ${run}`,
        planId,
        seats: 3,
        validUntil: new Date(Date.now() + 86_400_000),
        note: "Umowa 2026",
        managerEmail: manager.email,
        sponsorName: null,
        sponsorUrl: null,
        membersCanBuyDomains: true,
      });
      expect(await getEntitlements(manager.id)).toMatchObject({
        source: "license",
        features: { domainPurchase: true },
      });
      expect(
        await expireManualLicenses({ ...deps, now: () => new Date(Date.now() + 2 * 86_400_000) }),
      ).toBeGreaterThanOrEqual(1);
      expect((await db.organization.findUniqueOrThrow({ where: { id: org.id } })).status).toBe("EXPIRED");
      expect((await getEntitlements(manager.id)).canPublish).toBe(false);
    });
  },
);
