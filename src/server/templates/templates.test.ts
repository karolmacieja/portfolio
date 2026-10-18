import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { block } from "@/blocks/content";
import { SiteError } from "@/server/sites/errors";
import { DEFAULT_THEME, THEME_PRESETS } from "@/themes/theme";

import { TemplateError } from "./errors";

// Integration tests: template authoring, access, site creation, locks, layout switch and backups.
describe.skipIf(!process.env.DATABASE_URL)("templates (database)", async () => {
  const { db } = await import("@/lib/db");
  const admin = await import("./admin");
  const client = await import("./client");
  const sites = await import("@/server/sites/service");
  const { createPlanFixtures } = await import("@/server/entitlements/test-utils");
  const plans = createPlanFixtures(db);

  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const templateIds: string[] = [];
  let basicUser: string;
  let proUser: string;
  let stranger: string;

  async function createUser(name: string) {
    const user = await db.user.create({ data: { email: `${name}-${run}@test.local` } });
    userIds.push(user.id);
    return user.id;
  }

  async function createTemplate(slug: string, tier: string) {
    const { value } = await admin.createTemplate({
      name: slug,
      slug: `${slug}-${run}`,
      category: "photography",
    });
    templateIds.push(value.id);
    const meta = await db.template.findUniqueOrThrow({ where: { id: value.id } });
    await admin.updateTemplateMeta(value.id, {
      name: meta.name,
      slug: meta.slug,
      description: null,
      category: meta.category,
      tags: [],
      accessTier: tier,
      position: 0,
      isNew: false,
      isFeatured: false,
      isPremium: false,
      priceAmount: null,
      thumbnailUrl: null,
    });
    return value.id;
  }

  const hero = block("Hero", { title: "Template hero" });
  const text = block("Text", { text: "Template text" });

  let basicTemplate: string;
  let proTemplate: string;

  beforeAll(async () => {
    basicUser = await createUser("basic");
    proUser = await createUser("pro");
    stranger = await createUser("stranger");
    await plans.subscribe(basicUser, (await plans.createPlan({ accessTiers: ["basic"] })).id);
    await plans.subscribe(proUser, (await plans.createPlan({ accessTiers: ["basic", "pro"] })).id);
    await plans.subscribe(stranger, (await plans.createPlan({ accessTiers: ["basic"] })).id);

    basicTemplate = await createTemplate("basic", "basic");
    await admin.saveTemplatePage(
      basicTemplate,
      "home",
      { root: {}, content: [hero, text] },
      {
        [hero.props.id]: { delete: false, edit: false },
      },
    );
    await admin.addTemplatePage(basicTemplate, { title: "Galeria", path: "galeria" });
    await admin.saveTemplateTheme(basicTemplate, THEME_PRESETS.dark!);
    await admin.publishTemplate(basicTemplate, proUser);

    proTemplate = await createTemplate("pro", "basic");
    await admin.saveTemplatePage(
      proTemplate,
      "home",
      { root: {}, content: [block("Video"), block("Hero", { title: "Pro" })] },
      {},
    );
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.template.deleteMany({ where: { id: { in: templateIds } } });
    await plans.cleanup();
  });

  it("refuses to publish a template whose blocks exceed its tier", async () => {
    await expect(admin.publishTemplate(proTemplate, proUser)).rejects.toEqual(
      new TemplateError("tierTooLow", "pro"),
    );
    const meta = await db.template.findUniqueOrThrow({ where: { id: proTemplate } });
    await admin.updateTemplateMeta(proTemplate, {
      ...meta,
      description: null,
      accessTier: "pro",
      thumbnailUrl: null,
    });
    await admin.publishTemplate(proTemplate, proUser);
  });

  it("publishing creates versions; the gallery reflects access per plan", async () => {
    await admin.publishTemplate(basicTemplate, proUser);
    const versions = await db.templateVersion.findMany({ where: { templateId: basicTemplate } });
    expect(versions.map((v) => v.number).sort()).toEqual([1, 2]);

    const forBasic = (await client.listGallery(basicUser)).filter((t) => templateIds.includes(t.id));
    expect(Object.fromEntries(forBasic.map((t) => [t.id, t.canUse]))).toEqual({
      [basicTemplate]: true,
      [proTemplate]: false,
    });
    const forPro = (await client.listGallery(proUser)).filter((t) => templateIds.includes(t.id));
    expect(forPro.every((t) => t.canUse)).toBe(true);
  });

  it("overrides grant access beyond the tier", async () => {
    await expect(
      client.createSiteFromTemplate(basicUser, {
        templateId: proTemplate,
        name: "x",
        slug: `t-x-${run}`,
        locale: "pl",
      }),
    ).rejects.toEqual(new TemplateError("accessDenied"));
    await admin.addTemplateOverride(proTemplate, { userEmail: `basic-${run}@test.local` });
    const gallery = await client.listGallery(basicUser);
    expect(gallery.find((t) => t.id === proTemplate)?.canUse).toBe(true);
    await db.templateOverride.deleteMany({ where: { templateId: proTemplate } });
  });

  it("creates a site from a template copying pages, theme and locks", async () => {
    const { value } = await client.createSiteFromTemplate(basicUser, {
      templateId: basicTemplate,
      name: "From template",
      slug: `t-from-${run}`,
      locale: "pl",
    });
    const site = await db.site.findUniqueOrThrow({
      where: { id: value.id },
      include: { pages: { orderBy: { position: "asc" } } },
    });
    expect(site.pages.map((p) => p.path)).toEqual(["", "galeria"]);
    expect(site.themeDraft).toEqual(THEME_PRESETS.dark);
    expect(site.templateId).toBe(basicTemplate);
    expect(site.pages[0]!.lockRules).toEqual({ [hero.props.id]: { delete: false, edit: false } });
  });

  it("enforces template locks when saving the client's draft", async () => {
    const site = await db.site.findFirstOrThrow({
      where: { slug: `t-from-${run}` },
      include: { pages: true },
    });
    const home = site.pages.find((p) => p.path === "")!;
    const draft = home.draftContent as { content: { type: string; props: Record<string, unknown> }[] };

    await expect(
      sites.savePageDraft(basicUser, home.id, { root: {}, content: [draft.content[1]] }),
    ).rejects.toEqual(expect.objectContaining({ code: "blockLocked" }));
    const edited = { ...draft.content[0]!, props: { ...draft.content[0]!.props, title: "Changed" } };
    await expect(
      sites.savePageDraft(basicUser, home.id, { root: {}, content: [edited, draft.content[1]] }),
    ).rejects.toEqual(expect.objectContaining({ code: "blockLocked" }));
    // Unlocked blocks remain editable, locked ones can move.
    const textEdited = { ...draft.content[1]!, props: { ...draft.content[1]!.props, text: "Mine" } };
    await sites.savePageDraft(basicUser, home.id, { root: {}, content: [textEdited, draft.content[0]] });
  });

  it("detaches a site from its template: locks go after a backup, owner only", async () => {
    const site = await db.site.findFirstOrThrow({ where: { slug: `t-from-${run}` } });
    expect(await client.countLockedPages(basicUser, site.id)).toBe(1);
    await expect(client.detachTemplate(stranger, site.id)).rejects.toEqual(new SiteError("notFound"));

    const { value } = await client.detachTemplate(basicUser, site.id);
    expect(await client.countLockedPages(basicUser, site.id)).toBe(0);
    const backup = await db.siteBackup.findUniqueOrThrow({ where: { id: value.backupId } });
    expect(backup.reason).toBe("templateDetach");

    // The formerly delete-locked hero can now be removed; content and the template link stay.
    const home = await db.page.findFirstOrThrow({ where: { siteId: site.id, path: "" } });
    expect(home.lockRules).toBeNull();
    const draft = home.draftContent as { content: { type: string }[] };
    const withoutHero = draft.content.filter((b) => b.type !== "Hero");
    await sites.savePageDraft(basicUser, home.id, { root: {}, content: withoutHero });
    expect((await db.site.findUniqueOrThrow({ where: { id: site.id } })).templateId).toBe(basicTemplate);

    await expect(client.detachTemplate(basicUser, site.id)).rejects.toEqual(new TemplateError("noLocks"));
  });

  it("applies only the theme, or switches the layout with a backup and content mapping", async () => {
    const { value: own } = await sites.createSite(proUser, { name: "Own", slug: `t-own-${run}` });
    const home = await db.page.findFirstOrThrow({ where: { siteId: own.id, path: "" } });
    await sites.savePageDraft(proUser, home.id, {
      root: {},
      content: [block("Hero", { title: "My own title" }), block("Text", { text: "My own text" })],
    });
    await sites.publishSite(proUser, own.id);

    await client.applyTemplateTheme(proUser, own.id, basicTemplate);
    expect((await db.site.findUniqueOrThrow({ where: { id: own.id } })).themeDraft).toEqual(
      THEME_PRESETS.dark,
    );
    expect((await db.page.findUniqueOrThrow({ where: { id: home.id } })).draftContent).toMatchObject({
      content: [{ props: { title: "My own title" } }, { props: { text: "My own text" } }],
    });

    const { value } = await client.switchSiteTemplate(proUser, own.id, basicTemplate);
    const pages = await db.page.findMany({ where: { siteId: own.id }, orderBy: { position: "asc" } });
    expect(pages.map((p) => p.path)).toEqual(["", "galeria"]);
    const newHome = pages[0]!;
    // The edit-locked hero keeps the template's title; the text block takes the old content.
    expect(newHome.draftContent).toMatchObject({
      content: [{ props: { title: "Template hero" } }, { props: { text: "My own text" } }],
    });
    // Live content is untouched until the next publish.
    const firstTitle = (content: unknown) =>
      (content as { content: { props: { title?: string } }[] }).content[0]?.props.title;
    expect(firstTitle(newHome.publishedContent)).toBe("My own title");

    expect(await client.listBackups(proUser, own.id)).toHaveLength(1);
    await expect(client.restoreBackup(stranger, value.backupId)).rejects.toEqual(new SiteError("notFound"));
    await client.restoreBackup(proUser, value.backupId);
    const restored = await db.page.findMany({ where: { siteId: own.id } });
    expect(restored.map((p) => p.path)).toEqual([""]);
    expect(firstTitle(restored[0]!.draftContent)).toBe("My own title");
    expect((await db.site.findUniqueOrThrow({ where: { id: own.id } })).themeDraft).toEqual(
      THEME_PRESETS.dark,
    );
    expect(await client.listBackups(proUser, own.id)).toHaveLength(2);
  });

  it("denies template operations on other clients' sites", async () => {
    const site = await db.site.findFirstOrThrow({ where: { slug: `t-own-${run}` } });
    await expect(client.applyTemplateTheme(stranger, site.id, basicTemplate)).rejects.toEqual(
      new SiteError("notFound"),
    );
    await expect(client.switchSiteTemplate(stranger, site.id, basicTemplate)).rejects.toEqual(
      new SiteError("notFound"),
    );
    await expect(client.listBackups(stranger, site.id)).rejects.toEqual(new SiteError("notFound"));
  });

  it("archived templates disappear from the gallery and can't be used", async () => {
    await admin.setTemplateStatus(basicTemplate, "ARCHIVED");
    expect((await client.listGallery(basicUser)).some((t) => t.id === basicTemplate)).toBe(false);
    await expect(
      client.createSiteFromTemplate(stranger, {
        templateId: basicTemplate,
        name: "x",
        slug: `t-arch-${run}`,
        locale: "pl",
      }),
    ).rejects.toEqual(new TemplateError("notFound"));
    expect(DEFAULT_THEME).toBeDefined();
  });
});
