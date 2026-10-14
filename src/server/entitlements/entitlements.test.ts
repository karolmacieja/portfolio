import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { block } from "@/blocks/content";
import { SiteError } from "@/server/sites/errors";

// Integration tests: plan limits and access enforced by the services (database).
describe.skipIf(!process.env.DATABASE_URL)("entitlement enforcement (database)", async () => {
  const { db } = await import("@/lib/db");
  const service = await import("@/server/sites/service");
  const { getEntitlements } = await import("./index");
  const { createPlanFixtures } = await import("./test-utils");
  const plans = createPlanFixtures(db);

  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const slug = (name: string) => `t-${name}-${run}`;

  async function createUser(name: string) {
    const user = await db.user.create({ data: { email: `${name}-${run}@test.local` } });
    userIds.push(user.id);
    return user.id;
  }

  let basic: { id: string };
  let pro: { id: string };

  beforeAll(async () => {
    basic = await plans.createPlan({
      maxSites: 1,
      maxPagesPerSite: 2,
      maxProjects: 2,
      accessTiers: ["basic"],
    });
    pro = await plans.createPlan({
      maxSites: 3,
      maxPagesPerSite: 5,
      maxProjects: null,
      accessTiers: ["basic", "pro"],
    });
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await plans.cleanup();
  });

  it("users without a plan can build within the entry limits but cannot publish", async () => {
    const user = await createUser("free");
    const entitlements = await getEntitlements(user);
    expect(entitlements.plan).toBeNull();
    expect(entitlements.canPublish).toBe(false);

    const { value } = await service.createSite(user, { name: "Free", slug: slug("free") });
    await expect(service.publishSite(user, value.id)).rejects.toEqual(new SiteError("subscriptionRequired"));
  });

  it("enforces site and page limits", async () => {
    const user = await createUser("limits");
    await plans.subscribe(user, basic.id);
    const { value } = await service.createSite(user, { name: "One", slug: slug("one") });
    await expect(service.createSite(user, { name: "Two", slug: slug("two") })).rejects.toEqual(
      new SiteError("limit.sites"),
    );
    await service.createPage(user, value.id, { title: "A", path: "a" });
    await expect(service.createPage(user, value.id, { title: "B", path: "b" })).rejects.toEqual(
      new SiteError("limit.pages"),
    );
    await service.publishSite(user, value.id);
  });

  it("refuses new blocks above the plan tier but keeps them after a downgrade", async () => {
    const user = await createUser("tiers");
    await plans.subscribe(user, pro.id);
    const { value } = await service.createSite(user, { name: "Tiers", slug: slug("tiers") });
    const home = await db.page.findFirstOrThrow({ where: { siteId: value.id } });

    const video = block("Video", { url: "https://youtu.be/dQw4w9WgXcQ" });
    await service.savePageDraft(user, home.id, { root: {}, content: [video] });

    // Downgrade: the existing Video stays editable, a new Testimonials block is refused.
    await plans.subscribe(user, basic.id);
    await service.savePageDraft(user, home.id, {
      root: {},
      content: [{ ...video, props: { ...video.props, caption: "x" } }],
    });
    await expect(
      service.savePageDraft(user, home.id, { root: {}, content: [video, block("Testimonials")] }),
    ).rejects.toMatchObject({ code: "blockNotAllowed", details: ["Testimonials"] });
  });

  it("enforces the project limit without blocking edits of existing projects", async () => {
    const user = await createUser("projects");
    await plans.subscribe(user, pro.id);
    const { value } = await service.createSite(user, { name: "Projects", slug: slug("projects") });
    const home = await db.page.findFirstOrThrow({ where: { siteId: value.id } });
    const three = { root: {}, content: [block("Project"), block("Project"), block("Project")] };
    await service.savePageDraft(user, home.id, three);

    await plans.subscribe(user, basic.id); // maxProjects: 2
    await service.savePageDraft(user, home.id, three); // unchanged count: allowed
    await expect(
      service.savePageDraft(user, home.id, { root: {}, content: [...three.content, block("Project")] }),
    ).rejects.toEqual(new SiteError("limit.projects"));
    await service.savePageDraft(user, home.id, { root: {}, content: three.content.slice(0, 2) });
  });
});
