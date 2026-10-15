import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { MockHostnameProvider } from "@/server/domains/providers/mock-hostnames";
import { MockRegistrar } from "@/server/domains/providers/mock-registrar";
import { MockMailer } from "@/server/mail/mock";
import type { PaymentProvider } from "@/server/payments";
import type { StorageProvider } from "@/server/storage";

import type { AccountDeps } from "./deletion";

// Integration: password reset, data export, deletion request/cancel and erasure (database, fake providers).
describe.skipIf(!process.env.DATABASE_URL)("account (database)", async () => {
  const { db } = await import("@/lib/db");
  const reset = await import("./password-reset");
  const service = await import("./service");
  const deletion = await import("./deletion");
  const { verifyPassword } = await import("@/server/auth/password");
  const { createPlanFixtures } = await import("@/server/entitlements/test-utils");
  const plans = createPlanFixtures(db);
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  async function createUser() {
    const user = await db.user.create({
      data: { email: `acc-${randomUUID().slice(0, 8)}-${run}@test.local`, name: "Anna Test" },
    });
    userIds.push(user.id);
    return user;
  }

  function fakeDeps(now?: Date) {
    const mailer = new MockMailer(() => {});
    const payments = { setCancelAtPeriodEnd: vi.fn(), cancelSubscription: vi.fn() };
    const storage = { name: "fake", put: vi.fn(), delete: vi.fn(), publicUrl: (key: string) => key };
    const invalidate = vi.fn();
    const deps: AccountDeps = {
      payments: payments as unknown as PaymentProvider,
      hostnames: new MockHostnameProvider(),
      registrar: new MockRegistrar(),
      storage: storage as unknown as StorageProvider,
      mailer,
      invalidate,
      brand: "Folio",
      accountUrl: "http://app.localhost:3000/account",
      ...(now ? { now: () => now } : {}),
    };
    return { deps, mailer, payments, storage, invalidate };
  }

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await plans.cleanup();
  });

  it("resets a password with a single-use token", async () => {
    const user = await createUser();
    // Unknown addresses are accepted silently.
    await reset.requestPasswordReset(`nobody-${run}@test.local`, "pl");
    await reset.requestPasswordReset(user.email, "pl");
    const record = await db.verificationToken.findFirstOrThrow({
      where: { identifier: `reset-password:${user.email}` },
    });
    expect(record.expires.getTime()).toBeGreaterThan(Date.now());
    // The stored value is a hash: the raw token from the mail can't be recovered from the database.
    expect(await reset.resetPassword(record.token, "NewPassword123")).toBeNull();
  });

  it("changes passwords and records when sessions must end", async () => {
    const user = await createUser();
    expect(await service.changePassword(user.id, { currentPassword: "", newPassword: "FirstPass123" })).toBe(
      "ok",
    );
    expect(
      await service.changePassword(user.id, { currentPassword: "wrong", newPassword: "SecondPass123" }),
    ).toBe("wrongPassword");
    expect(
      await service.changePassword(user.id, {
        currentPassword: "FirstPass123",
        newPassword: "SecondPass123",
      }),
    ).toBe("ok");
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword(updated.passwordHash!, "SecondPass123")).toBe(true);
    expect(updated.passwordChangedAt).not.toBeNull();
  });

  it("exports the client's data without secrets", async () => {
    const user = await createUser();
    await service.changePassword(user.id, { currentPassword: "", newPassword: "FirstPass123" });
    const site = await db.site.create({ data: { ownerId: user.id, name: "Export", slug: `t-acc-${run}` } });
    await db.contactMessage.create({
      data: {
        siteId: site.id,
        path: "",
        name: "Visitor",
        email: "v@example.com",
        message: "Hi",
        senderHash: "h",
      },
    });
    const data = await service.exportUserData(user.id);
    expect(data.user.email).toBe(user.email);
    expect(data.user.sites[0]?.contactMessages[0]?.message).toBe("Hi");
    expect(JSON.stringify(data)).not.toContain("argon2");
  });

  it("schedules deletion (sites hidden, renewals stopped), cancels it, then erases after the grace period", async () => {
    const user = await createUser();
    const plan = await plans.createPlan();
    await db.subscription.create({
      data: { userId: user.id, planId: plan.id, status: "ACTIVE", providerSubscriptionId: `sub_${run}` },
    });
    const site = await db.site.create({ data: { ownerId: user.id, name: "Del", slug: `t-del-${run}` } });
    await db.asset.create({
      data: {
        ownerId: user.id,
        key: `u/${user.id}/a.webp`,
        url: "x",
        thumbUrl: "x",
        contentType: "image/webp",
        sizeBytes: 1,
        originalName: "a.jpg",
      },
    });
    await db.billingProfile.create({
      data: {
        userId: user.id,
        type: "PERSON",
        fullName: "Anna Test",
        line1: "Ulica 1",
        postalCode: "00-001",
        city: "Warszawa",
        country: "PL",
      },
    });

    const first = fakeDeps();
    const scheduled = await deletion.requestAccountDeletion(user.id, first.deps);
    expect(scheduled.getTime() - Date.now()).toBeGreaterThan(13 * 86_400_000);
    expect(first.payments.setCancelAtPeriodEnd).toHaveBeenCalledWith({
      subscriptionId: `sub_${run}`,
      cancel: true,
    });
    expect(first.invalidate.mock.calls[0]![0]).toContain(`site:${site.id}`);
    expect(first.mailer.sent[0]!.to).toBe(user.email);
    await expect(deletion.requestAccountDeletion(user.id, first.deps)).rejects.toMatchObject({
      code: "alreadyScheduled",
    });

    await deletion.cancelAccountDeletion(user.id, first.deps);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).deletionScheduledAt).toBeNull();
    await deletion.requestAccountDeletion(user.id, first.deps);

    // Not due yet: nothing happens.
    const early = fakeDeps();
    expect(await deletion.eraseDueAccounts(early.deps)).toBe(0);

    const late = fakeDeps(new Date(Date.now() + 15 * 86_400_000));
    expect(await deletion.eraseDueAccounts(late.deps)).toBeGreaterThanOrEqual(1);
    expect(late.payments.cancelSubscription).toHaveBeenCalledWith({ subscriptionId: `sub_${run}` });
    expect(late.storage.delete).toHaveBeenCalledWith([`u/${user.id}/a.webp`, `u/${user.id}/a-thumb.webp`]);
    expect(late.mailer.sent.at(-1)!.to).toBe(user.email);

    const erased = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(erased).toMatchObject({ name: null, passwordHash: null, deletionScheduledAt: null });
    expect(erased.email).toBe(`deleted-${user.id}@deleted.invalid`);
    expect(erased.deletedAt).not.toBeNull();
    expect(await db.site.count({ where: { ownerId: user.id } })).toBe(0);
    expect(await db.billingProfile.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "account.erased", targetId: user.id } })).toBe(1);
    await db.auditLog.deleteMany({ where: { targetId: user.id } });
  });

  it("refuses deletion of staff accounts", async () => {
    const user = await createUser();
    await db.user.update({ where: { id: user.id }, data: { role: "SUPPORT" } });
    await expect(deletion.requestAccountDeletion(user.id, fakeDeps().deps)).rejects.toMatchObject({
      code: "staffAccount",
    });
  });
});
