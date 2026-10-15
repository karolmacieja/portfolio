import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { MockMailer } from "@/server/mail/mock";

// Integration: audiences with consent, frozen recipient lists, batched sending, one-click unsubscribe (database).
describe.skipIf(!process.env.DATABASE_URL)("newsletter (database)", async () => {
  const { db } = await import("@/lib/db");
  const { prepareCampaign, sendCampaignBatch, unsubscribe } = await import("./sending");
  const { unsubscribeToken, UNSUBSCRIBE_PURPOSE } = await import("./render");
  const { verifySignedToken } = await import("@/lib/signed-token");
  const { getEnv } = await import("@/lib/env");
  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const campaignIds: string[] = [];
  const org = { id: "" };

  async function createUser(name: string, consent: boolean) {
    const user = await db.user.create({
      data: {
        email: `nl-${name}-${run}@test.local`,
        name,
        marketingConsent: consent,
        emailVerified: new Date(),
      },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await db.campaign.deleteMany({ where: { id: { in: campaignIds } } });
    if (org.id) await db.organization.delete({ where: { id: org.id } }).catch(() => undefined);
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("sends marketing only to consenting members of the segment, with a one-click unsubscribe", async () => {
    const anna = await createUser("Anna", true);
    const jan = await createUser("Jan", false);
    const plan = await db.plan.findFirst();
    if (!plan) return; // CI without a seed has no plans; the organization needs one.
    const created = await db.organization.create({
      data: {
        name: `NL ${run}`,
        planId: plan.id,
        seats: 5,
        source: "MANUAL",
        status: "ACTIVE",
        joinCode: `nl-${randomUUID()}`,
        members: { create: [{ userId: anna.id }, { userId: jan.id }] },
      },
    });
    org.id = created.id;
    const campaign = await db.campaign.create({
      data: {
        subject: "Nowości dla {name}",
        body: "## Cześć {name}\n\nMamy nowe szablony.",
        type: "MARKETING",
        audience: { segment: "organization", organizationId: created.id },
        status: "SCHEDULED",
        scheduledAt: new Date(),
      },
    });
    campaignIds.push(campaign.id);

    expect(await prepareCampaign(campaign.id)).toBe(true);
    expect(await prepareCampaign(campaign.id)).toBe(false);
    const mailer = new MockMailer(() => {});
    expect(await sendCampaignBatch(campaign.id, { mailer, enqueueBatch: () => {} })).toBe(0);

    expect(mailer.sent.map((m) => m.to)).toEqual([anna.email]);
    const mail = mailer.sent[0]!;
    expect(mail.subject).toBe("Nowości dla Anna");
    expect(mail.html).toContain("Cześć Anna");
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const saved = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(saved).toMatchObject({ status: "SENT", recipientsCount: 1, sentCount: 1 });

    const token = unsubscribeToken(anna.id, campaign.id);
    const payload = verifySignedToken<{ userId: string; campaignId: string }>(
      token,
      getEnv().AUTH_SECRET,
      UNSUBSCRIBE_PURPOSE,
    );
    expect(await unsubscribe(payload!.userId, payload!.campaignId)).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: anna.id } })).marketingConsent).toBe(false);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).unsubscribes).toBe(1);
  });

  it("sends service announcements without consent and skips people who withdrew it meanwhile", async () => {
    const ola = await createUser("Ola", false);
    const ewa = await createUser("Ewa", true);
    const service = await db.campaign.create({
      data: {
        subject: "Zmiana regulaminu",
        body: "Zmieniamy regulamin od przyszłego miesiąca.",
        type: "SERVICE",
        audience: { segment: "all" },
        status: "SCHEDULED",
        scheduledAt: new Date(),
      },
    });
    campaignIds.push(service.id);
    await prepareCampaign(service.id);
    const recipients = await db.campaignRecipient.findMany({
      where: { campaignId: service.id, userId: { in: [ola.id, ewa.id] } },
    });
    expect(recipients).toHaveLength(2);

    const marketing = await db.campaign.create({
      data: {
        subject: "Promocja",
        body: "Rabat 20% na plan roczny.",
        type: "MARKETING",
        audience: { segment: "all" },
        status: "SCHEDULED",
        scheduledAt: new Date(),
      },
    });
    campaignIds.push(marketing.id);
    await prepareCampaign(marketing.id);
    expect(await db.campaignRecipient.count({ where: { campaignId: marketing.id, userId: ola.id } })).toBe(0);
    await db.user.update({ where: { id: ewa.id }, data: { marketingConsent: false } });
    const mailer = new MockMailer(() => {});
    while ((await sendCampaignBatch(marketing.id, { mailer, enqueueBatch: () => {} })) > 0);
    expect(mailer.sent.some((m) => m.to === ewa.email)).toBe(false);
    expect(
      (await db.campaignRecipient.findFirstOrThrow({ where: { campaignId: marketing.id, userId: ewa.id } }))
        .status,
    ).toBe("SKIPPED");
  });
});
