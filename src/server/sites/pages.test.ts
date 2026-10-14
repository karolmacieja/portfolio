import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { block } from "@/blocks/content";
import { DEFAULT_THEME, THEME_PRESETS } from "@/themes/theme";

import { hostTag, siteTag } from "./cache-tags";
import { SiteError } from "./errors";

// Integration tests against PostgreSQL: pages, drafts, publishing, versions, theme and settings.
describe.skipIf(!process.env.DATABASE_URL)("site pages, versions and settings (database)", async () => {
  const { db } = await import("@/lib/db");
  const service = await import("./service");
  const { createPlanFixtures } = await import("@/server/entitlements/test-utils");
  const plans = createPlanFixtures(db);

  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let owner: string;
  let stranger: string;
  let siteId: string;
  let homeId: string;

  async function createUser(name: string) {
    const user = await db.user.create({ data: { email: `${name}-${run}@test.local`, name } });
    userIds.push(user.id);
    return user.id;
  }

  beforeAll(async () => {
    owner = await createUser("owner");
    stranger = await createUser("stranger");
    await plans.subscribe(owner, (await plans.createPlan()).id);
    const { value } = await service.createSite(owner, { name: "Pages", slug: `t-pages-${run}` });
    siteId = value.id;
    homeId = (await db.page.findFirstOrThrow({ where: { siteId, path: "" } })).id;
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await plans.cleanup();
  });

  it("saves valid drafts and rejects invalid content", async () => {
    const content = { root: { props: {} }, content: [block("Text", { heading: "Hello", text: "World" })] };
    await service.savePageDraft(owner, homeId, content);
    const page = await db.page.findUniqueOrThrow({ where: { id: homeId } });
    expect(page.draftContent).toMatchObject({ content: [{ type: "Text", props: { heading: "Hello" } }] });

    const invalid = { root: {}, content: [block("Hero", { buttonHref: "javascript:alert(1)" })] };
    await expect(service.savePageDraft(owner, homeId, invalid)).rejects.toMatchObject({
      code: "invalidContent",
    });
  });

  it("creates pages with validated, unique paths", async () => {
    const { value } = await service.createPage(owner, siteId, { title: "Projekty", path: "/Projekty/" });
    expect((await db.page.findUniqueOrThrow({ where: { id: value.id } })).path).toBe("projekty");
    await expect(service.createPage(owner, siteId, { title: "x", path: "projekty" })).rejects.toEqual(
      new SiteError("pathTaken"),
    );
    await expect(service.createPage(owner, siteId, { title: "x", path: "api" })).rejects.toEqual(
      new SiteError("path.reserved"),
    );
  });

  it("keeps the home page at / and refuses to delete it", async () => {
    await service.updatePageMeta(owner, homeId, {
      title: "Start",
      path: "elsewhere",
      seoTitle: "SEO",
      seoDescription: null,
      ogImageUrl: null,
    });
    const home = await db.page.findUniqueOrThrow({ where: { id: homeId } });
    expect([home.path, home.title, home.seoTitle]).toEqual(["", "Start", "SEO"]);
    await expect(service.deletePage(owner, homeId)).rejects.toEqual(new SiteError("cannotDeleteHome"));
  });

  it("reorders pages", async () => {
    const projects = await db.page.findFirstOrThrow({ where: { siteId, path: "projekty" } });
    await service.movePage(owner, projects.id, "up");
    const order = await db.page.findMany({
      where: { siteId },
      orderBy: { position: "asc" },
      select: { path: true },
    });
    expect(order.map((p) => p.path)).toEqual(["projekty", ""]);
  });

  it("denies every page operation to other clients", async () => {
    const content = { root: {}, content: [] };
    await expect(service.savePageDraft(stranger, homeId, content)).rejects.toEqual(new SiteError("notFound"));
    await expect(service.createPage(stranger, siteId, { title: "x", path: "hack" })).rejects.toEqual(
      new SiteError("notFound"),
    );
    await expect(service.deletePage(stranger, homeId)).rejects.toEqual(new SiteError("notFound"));
    await expect(service.movePage(stranger, homeId, "down")).rejects.toEqual(new SiteError("notFound"));
    await expect(service.getPageForEditing(stranger, homeId)).rejects.toEqual(new SiteError("notFound"));
    await expect(service.saveThemeDraft(stranger, siteId, DEFAULT_THEME)).rejects.toEqual(
      new SiteError("notFound"),
    );
    await expect(service.listVersions(stranger, siteId)).rejects.toEqual(new SiteError("notFound"));
  });

  it("publishing creates versions only for changed pages and publishes the theme", async () => {
    await service.saveThemeDraft(owner, siteId, THEME_PRESETS.dark!);
    await service.publishSite(owner, siteId);
    let pages = await service.listVersions(owner, siteId);
    expect(pages.map((p) => p.versions.length)).toEqual([1, 1]);
    expect((await service.getSite(owner, siteId)).themePublished).toEqual(THEME_PRESETS.dark);

    // Nothing changed: no new versions.
    await service.publishSite(owner, siteId);
    pages = await service.listVersions(owner, siteId);
    expect(pages.map((p) => p.versions.length)).toEqual([1, 1]);

    const site = await service.getSiteWithPages(owner, siteId);
    expect(site.hasUnpublishedChanges).toBe(false);
  });

  it("restores a version into the draft without touching the live page", async () => {
    await service.savePageDraft(owner, homeId, { root: {}, content: [block("Text", { text: "v2" })] });
    await service.publishSite(owner, siteId);
    const [version1] = (await service.listVersions(owner, siteId))
      .find((p) => p.id === homeId)!
      .versions.slice(-1);
    expect(version1?.number).toBe(1);

    await expect(service.restoreVersion(stranger, version1!.id)).rejects.toEqual(new SiteError("notFound"));
    await service.restoreVersion(owner, version1!.id);
    const page = await db.page.findUniqueOrThrow({ where: { id: homeId } });
    expect(page.draftContent).toMatchObject({ content: [{ props: { heading: "Hello" } }] });
    expect(page.publishedContent).toMatchObject({ content: [{ props: { text: "v2" } }] });
  });

  it("keeps only the last versions", async () => {
    for (let i = 0; i < service.MAX_VERSIONS_PER_PAGE + 2; i++) {
      await service.savePageDraft(owner, homeId, { root: {}, content: [block("Text", { text: `n${i}` })] });
      await service.publishSite(owner, siteId);
    }
    const versions = await db.pageVersion.findMany({ where: { pageId: homeId } });
    expect(versions).toHaveLength(service.MAX_VERSIONS_PER_PAGE);
  });

  it("renaming the slug invalidates old and new hosts", async () => {
    const site = await service.getSite(owner, siteId);
    const { invalidate } = await service.updateSiteSettings(owner, siteId, {
      name: "Renamed",
      slug: `t-renamed-${run}`,
      locale: "en",
      description: "Desc",
      noIndex: true,
      faviconUrl: null,
    });
    expect(invalidate).toContain(siteTag(siteId));
    expect(invalidate.some((tag) => tag.startsWith(hostTag(`${site.slug}.`)))).toBe(true);
    expect(invalidate.some((tag) => tag.startsWith(hostTag(`t-renamed-${run}.`)))).toBe(true);
    await expect(
      service.updateSiteSettings(stranger, siteId, {
        name: "x",
        slug: `t-x-${run}`,
        locale: "pl",
        description: null,
        noIndex: false,
        faviconUrl: null,
      }),
    ).rejects.toEqual(new SiteError("notFound"));
  });
});
