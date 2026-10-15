import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MockMailer } from "@/server/mail/mock";

import { MockHostnameProvider } from "./providers/mock-hostnames";
import type { DomainDeps } from "./status";

// Integration tests: connecting domains, verification, primary address and downgrade (database).
describe.skipIf(!process.env.DATABASE_URL)("custom domains (database)", async () => {
  const { db } = await import("@/lib/db");
  const service = await import("./service");
  const status = await import("./status");
  const { createPlanFixtures } = await import("@/server/entitlements/test-utils");
  const plans = createPlanFixtures(db);

  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let withDomains: string;
  let withoutDomains: string;
  let invalidated: string[];
  let mailer: MockMailer;
  let now: Date;

  const deps = (): DomainDeps => ({
    hostnames: new MockHostnameProvider(),
    env: {
      CUSTOM_DOMAIN_CNAME_TARGET: "sites.example.test",
      ROOT_DOMAIN: "example.test",
      CUSTOM_DOMAIN_APEX_IPS: [],
    },
    invalidate: (tags) => void invalidated.push(...tags),
    mailer,
    brand: "Test",
    panelUrl: "http://app.test/dashboard",
    now: () => now,
  });
  const host = (label: string) => `${label}-${run}.example.pl`;

  async function createUser(planId?: string) {
    const user = await db.user.create({
      data: { email: `dom-${randomUUID().slice(0, 8)}-${run}@test.local` },
    });
    userIds.push(user.id);
    if (planId) await plans.subscribe(user.id, planId);
    const site = await db.site.create({
      data: {
        ownerId: user.id,
        name: "S",
        slug: `t-dom-${randomUUID().slice(0, 8)}`,
        publishedAt: new Date(),
      },
    });
    return { userId: user.id, siteId: site.id };
  }

  beforeAll(async () => {
    withDomains = (await plans.createPlan({ features: { customDomain: true } })).id;
    withoutDomains = (await plans.createPlan({ features: {} })).id;
  });

  beforeEach(() => {
    invalidated = [];
    mailer = new MockMailer(() => {});
    now = new Date();
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await plans.cleanup();
  });

  it("requires the customDomain feature and validates hostnames", async () => {
    const free = await createUser(withoutDomains);
    await expect(
      service.addDomain(
        free.userId,
        free.siteId,
        { hostname: host("free"), includeCompanion: false },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "featureRequired" });
    const pro = await createUser(withDomains);
    await expect(
      service.addDomain(pro.userId, pro.siteId, { hostname: "*.jan.pl", includeCompanion: false }, deps()),
    ).rejects.toMatchObject({ code: "hostname.wildcard" });
  });

  it("adds a domain with its www companion, shows DNS records and activates on the next check", async () => {
    const { userId, siteId } = await createUser(withDomains);
    const created = await service.addDomain(
      userId,
      siteId,
      { hostname: `https://${host("jan")}/`, includeCompanion: true },
      deps(),
    );
    expect(created.map((d) => [d.hostname, d.status, d.isPrimary])).toEqual([
      [host("jan"), "PENDING_DNS", true],
      [`www.${host("jan")}`, "PENDING_DNS", false],
    ]);
    expect(created[1]!.dnsRecords).toEqual([
      { type: "CNAME", name: `www.${host("jan")}`, value: "sites.example.test", purpose: "routing" },
      expect.objectContaining({ type: "TXT", purpose: "ownership" }),
    ]);

    now = new Date(now.getTime() + 2 * 60_000); // pending domains are checked every minute at first
    expect(await status.checkDomains(deps())).toBeGreaterThanOrEqual(2);
    const domains = await service.listSiteDomains(userId, siteId);
    expect(domains.map((d) => d.status)).toEqual(["ACTIVE", "ACTIVE"]);
    expect(invalidated).toEqual(expect.arrayContaining([`host:${host("jan")}`, `site:${siteId}`]));
    expect(mailer.sent.map((m) => m.subject)).toEqual([
      expect.stringContaining(host("jan")),
      expect.stringContaining(`www.${host("jan")}`),
    ]);
  });

  it("keeps other tenants out and protects verified hostnames, releasing stale claims", async () => {
    const owner = await createUser(withDomains);
    const other = await createUser(withDomains);
    const [domain] = await service.addDomain(
      owner.userId,
      owner.siteId,
      { hostname: host("own"), includeCompanion: false },
      deps(),
    );

    await expect(service.listSiteDomains(other.userId, owner.siteId)).rejects.toMatchObject({
      code: "notFound",
    });
    await expect(service.removeDomain(other.userId, domain!.id, deps())).rejects.toMatchObject({
      code: "notFound",
    });
    await expect(service.setPrimaryDomain(other.userId, domain!.id, deps())).rejects.toMatchObject({
      code: "notFound",
    });
    await expect(service.checkDomainNow(other.userId, domain!.id, deps())).rejects.toMatchObject({
      code: "notFound",
    });
    await expect(
      service.addDomain(
        other.userId,
        other.siteId,
        { hostname: host("own"), includeCompanion: false },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "hostnameTaken" });

    // Never verified for more than 48 hours: another client may take it over.
    await db.domain.update({
      where: { id: domain!.id },
      data: { createdAt: new Date(Date.now() - 49 * 3600_000) },
    });
    const [taken] = await service.addDomain(
      other.userId,
      other.siteId,
      { hostname: host("own"), includeCompanion: false },
      deps(),
    );
    expect(taken!.siteId).toBe(other.siteId);
    expect(await db.domain.count({ where: { id: domain!.id } })).toBe(0);
  });

  it("enforces the hostname limit and moves the primary address on removal", async () => {
    const { userId, siteId } = await createUser(withDomains);
    const [first] = await service.addDomain(
      userId,
      siteId,
      { hostname: host("a"), includeCompanion: true },
      deps(),
    );
    await service.addDomain(userId, siteId, { hostname: host("b"), includeCompanion: true }, deps());
    await expect(
      service.addDomain(userId, siteId, { hostname: host("c"), includeCompanion: false }, deps()),
    ).rejects.toMatchObject({ code: "limitReached" });

    await service.removeDomain(userId, first!.id, deps());
    expect((await service.listSiteDomains(userId, siteId)).filter((d) => d.isPrimary)).toHaveLength(1);
  });

  it("disables domains after the grace period when the plan loses custom domains", async () => {
    const { userId, siteId } = await createUser(withDomains);
    const [domain] = await service.addDomain(
      userId,
      siteId,
      { hostname: host("down"), includeCompanion: false },
      deps(),
    );
    await plans.subscribe(userId, withoutDomains);

    await status.enforceDomainEntitlements(deps());
    expect(await db.domain.findUniqueOrThrow({ where: { id: domain!.id } })).toMatchObject({
      status: "PENDING_DNS",
      entitlementLostAt: now,
    });
    expect(mailer.sent.at(-1)!.subject).toMatch(/nie obejmuje/);

    now = new Date(now.getTime() + 8 * 86_400_000);
    await status.enforceDomainEntitlements(deps());
    expect(await db.domain.findUniqueOrThrow({ where: { id: domain!.id } })).toMatchObject({
      status: "DISABLED",
      providerHostnameId: null,
    });
    await expect(service.reenableDomain(userId, domain!.id, deps())).rejects.toMatchObject({
      code: "featureRequired",
    });

    await plans.subscribe(userId, withDomains);
    await service.reenableDomain(userId, domain!.id, deps());
    expect(await db.domain.findUniqueOrThrow({ where: { id: domain!.id } })).toMatchObject({
      status: "PENDING_DNS",
      entitlementLostAt: null,
    });
  });
});
