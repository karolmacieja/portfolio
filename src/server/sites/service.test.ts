import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { starterContent } from "@/blocks/content";

import { hostTag, siteTag } from "./cache-tags";
import { SiteError } from "./errors";

// Integration tests against PostgreSQL (docker compose locally, service container in CI).
describe.skipIf(!process.env.DATABASE_URL)("site service (database)", async () => {
  const { db } = await import("@/lib/db");
  const service = await import("./service");
  const { createPlanFixtures } = await import("@/server/entitlements/test-utils");
  const plans = createPlanFixtures(db);

  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let alice: string;
  let bob: string;

  async function createUser(name: string) {
    const user = await db.user.create({ data: { email: `${name}-${run}@test.local`, name } });
    userIds.push(user.id);
    return user.id;
  }

  const slug = (name: string) => `t-${name}-${run}`;

  beforeAll(async () => {
    alice = await createUser("alice");
    bob = await createUser("bob");
    const plan = await plans.createPlan();
    await plans.subscribe(alice, plan.id);
    await plans.subscribe(bob, plan.id);
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await plans.cleanup();
  });

  it("creates a site with a home page draft and invalidates the host lookup", async () => {
    const { value, invalidate } = await service.createSite(alice, {
      name: "Alice",
      slug: slug("alice"),
      content: starterContent({ title: "Alice", subtitle: "", body: "" }),
    });
    const pages = await db.page.findMany({ where: { siteId: value.id } });
    expect(pages).toHaveLength(1);
    expect(pages[0]?.path).toBe("");
    expect(pages[0]?.publishedContent).toBeNull();
    expect(invalidate).toEqual([
      hostTag(`${slug("alice")}.${new URL(`http://${process.env.ROOT_DOMAIN}`).hostname}`),
    ]);
  });

  it("rejects taken and invalid slugs", async () => {
    await expect(service.createSite(bob, { name: "Bob", slug: slug("alice") })).rejects.toEqual(
      new SiteError("slugTaken"),
    );
    await expect(service.createSite(bob, { name: "Bob", slug: "admin" })).rejects.toEqual(
      new SiteError("slugInvalid"),
    );
    expect(await service.isSlugAvailable(slug("alice"))).toBe(false);
    expect(await service.isSlugAvailable(slug("free"))).toBe(true);
  });

  it("lists only the owner's sites", async () => {
    await service.createSite(bob, { name: "Bob", slug: slug("bob") });
    const aliceSites = await service.listSites(alice);
    const bobSites = await service.listSites(bob);
    expect(aliceSites.map((s) => s.slug)).toEqual([slug("alice")]);
    expect(bobSites.map((s) => s.slug)).toEqual([slug("bob")]);
  });

  it("does not let a client read or publish another client's site", async () => {
    const [aliceSite] = await service.listSites(alice);
    await expect(service.getSite(bob, aliceSite!.id)).rejects.toEqual(new SiteError("notFound"));
    await expect(service.publishSite(bob, aliceSite!.id)).rejects.toEqual(new SiteError("notFound"));
    const page = await db.page.findFirstOrThrow({ where: { siteId: aliceSite!.id } });
    expect(page.publishedContent).toBeNull();
  });

  it("publishing copies drafts to published content and clears 'unpublished changes'", async () => {
    const [site] = await service.listSites(alice);
    expect(site?.hasUnpublishedChanges).toBe(true);

    const { invalidate } = await service.publishSite(alice, site!.id);
    expect(invalidate).toEqual([siteTag(site!.id)]);

    const page = await db.page.findFirstOrThrow({ where: { siteId: site!.id } });
    expect(page.publishedContent).toEqual(page.draftContent);
    const [after] = await service.listSites(alice);
    expect(after?.publishedAt).not.toBeNull();
    expect(after?.hasUnpublishedChanges).toBe(false);
  });

  it("suspends and restores a site", async () => {
    const [site] = await service.listSites(alice);
    await service.suspendSite(site!.id, "PAYMENT");
    expect((await service.getSite(alice, site!.id)).status).toBe("SUSPENDED");
    await service.unsuspendSite(site!.id);
    const restored = await service.getSite(alice, site!.id);
    expect(restored.status).toBe("ACTIVE");
    expect(restored.suspensionReason).toBeNull();
  });
});
