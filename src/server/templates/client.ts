import "server-only";

import { normalizeLockRules } from "@/blocks/locks";
import { Prisma, TemplateStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { validateSlug } from "@/lib/slug";
import { canAddMore, canUseTemplate, canUseTier, getEntitlements } from "@/server/entitlements";
import { hostTag, siteTag } from "@/server/sites/cache-tags";
import { SiteError } from "@/server/sites/errors";
import { siteSubdomainHostname } from "@/server/sites/urls";
import { parseTheme } from "@/themes/theme";

import { TemplateError } from "./errors";
import { mapTemplateContent } from "./mapping";
import { parseTemplatePages, type TemplatePage } from "./schema";

/**
 * Templates for clients: gallery with access flags, creating a site from a template and switching a
 * site's template (theme only, or full layout with a backup). Owner-scoped like the site service.
 */

type Result<T> = { value: T; invalidate: string[] };
const toJson = (value: unknown) => value as Prisma.InputJsonObject;

export type GalleryTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  accessTier: string;
  thumbnailUrl: string | null;
  isNew: boolean;
  isFeatured: boolean;
  isPremium: boolean;
  priceAmount: number | null;
  canUse: boolean;
  /** A premium template that the user's plan allows and that can be bought now. */
  canBuy: boolean;
};

export async function listGallery(userId: string, category?: string): Promise<GalleryTemplate[]> {
  const [templates, entitlements, purchases] = await Promise.all([
    db.template.findMany({
      where: {
        status: TemplateStatus.PUBLISHED,
        publishedVersionId: { not: null },
        ...(category ? { category } : {}),
      },
      orderBy: [{ isFeatured: "desc" }, { position: "asc" }, { createdAt: "asc" }],
      include: { overrides: { select: { planId: true, userId: true } } },
    }),
    getEntitlements(userId),
    db.templatePurchase.findMany({ where: { userId }, select: { templateId: true } }),
  ]);
  const purchased = new Set(purchases.map((p) => p.templateId));
  return templates.map(({ overrides, draft: _draft, ...t }) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    category: t.category,
    tags: t.tags,
    accessTier: t.accessTier,
    thumbnailUrl: t.thumbnailUrl,
    isNew: t.isNew,
    isFeatured: t.isFeatured,
    isPremium: t.isPremium,
    priceAmount: t.priceAmount,
    canUse: canUseTemplate(entitlements, { ...t, overrides }, userId, purchased.has(t.id)),
    canBuy:
      t.isPremium &&
      Boolean(t.priceAmount) &&
      !purchased.has(t.id) &&
      !canUseTemplate(entitlements, { ...t, overrides }, userId, false) &&
      canUseTier(entitlements, t.accessTier),
  }));
}

/** Loads a published template the user may use, with its current version. */
async function loadUsableTemplate(userId: string, templateId: string) {
  const template = await db.template.findFirst({
    where: { id: templateId, status: TemplateStatus.PUBLISHED },
    include: { publishedVersion: true, overrides: { select: { planId: true, userId: true } } },
  });
  if (!template?.publishedVersion) throw new TemplateError("notFound");
  const [entitlements, purchase] = await Promise.all([
    getEntitlements(userId),
    db.templatePurchase.findUnique({ where: { templateId_userId: { templateId, userId } } }),
  ]);
  if (!canUseTemplate(entitlements, template, userId, Boolean(purchase)))
    throw new TemplateError("accessDenied");
  return {
    template,
    version: template.publishedVersion,
    pages: parseTemplatePages(template.publishedVersion.pages),
    entitlements,
  };
}

function pageData(page: TemplatePage, position: number) {
  return {
    path: page.path,
    title: page.title,
    position,
    draftContent: toJson(page.content),
    lockRules: toJson(normalizeLockRules(page.lockRules, page.content)),
  };
}

export async function createSiteFromTemplate(
  ownerId: string,
  input: { templateId: string; name: string; slug: string; locale: string },
): Promise<Result<{ id: string }>> {
  const { template, version, pages, entitlements } = await loadUsableTemplate(ownerId, input.templateId);
  if (!validateSlug(input.slug).ok) throw new SiteError("slugInvalid");
  if (!canAddMore(entitlements.limits.maxSites, await db.site.count({ where: { ownerId } }))) {
    throw new SiteError("limit.sites");
  }
  if (pages.length > entitlements.limits.maxPagesPerSite) throw new SiteError("limit.pages");

  try {
    const site = await db.site.create({
      data: {
        ownerId,
        name: input.name,
        slug: input.slug,
        locale: input.locale,
        themeDraft: toJson(parseTheme(version.theme)),
        templateId: template.id,
        templateVersionId: version.id,
        pages: { create: pages.map((page, i) => pageData(page, i)) },
      },
    });
    return { value: { id: site.id }, invalidate: [hostTag(siteSubdomainHostname(site.slug))] };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SiteError("slugTaken");
    }
    throw error;
  }
}

async function getOwnedSite(ownerId: string, siteId: string) {
  const site = await db.site.findFirst({
    where: { id: siteId, ownerId },
    include: { pages: { orderBy: { position: "asc" } } },
  });
  if (!site) throw new SiteError("notFound");
  return site;
}

/** Option (a): takes only the template's theme into the site's theme draft; content is untouched. */
export async function applyTemplateTheme(
  ownerId: string,
  siteId: string,
  templateId: string,
): Promise<Result<void>> {
  const site = await getOwnedSite(ownerId, siteId);
  const { version } = await loadUsableTemplate(ownerId, templateId);
  await db.site.update({ where: { id: site.id }, data: { themeDraft: toJson(parseTheme(version.theme)) } });
  return { value: undefined, invalidate: [] };
}

type SiteWithPages = Awaited<ReturnType<typeof getOwnedSite>>;

function snapshot(site: SiteWithPages) {
  return {
    themeDraft: site.themeDraft,
    themePublished: site.themePublished,
    templateId: site.templateId,
    templateVersionId: site.templateVersionId,
    pages: site.pages.map((p) => ({
      path: p.path,
      title: p.title,
      position: p.position,
      draftContent: p.draftContent,
      publishedContent: p.publishedContent,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      ogImageUrl: p.ogImageUrl,
      lockRules: p.lockRules,
    })),
  };
}

async function createBackup(site: SiteWithPages, reason: string, actorId: string) {
  return db.siteBackup.create({
    data: { siteId: site.id, reason, data: toJson(snapshot(site)), createdById: actorId },
  });
}

/**
 * Option (b): full layout change. The whole site is backed up first; template pages replace the
 * site's pages (matching paths keep their live content until the next publish), and the new
 * template blocks are filled with existing content of the same block type.
 */
export async function switchSiteTemplate(
  ownerId: string,
  siteId: string,
  templateId: string,
): Promise<Result<{ backupId: string }>> {
  const site = await getOwnedSite(ownerId, siteId);
  const { template, version, pages, entitlements } = await loadUsableTemplate(ownerId, templateId);
  if (pages.length > entitlements.limits.maxPagesPerSite) throw new SiteError("limit.pages");

  const backup = await createBackup(site, "templateSwitch", ownerId);
  const mapped = mapTemplateContent(
    pages,
    site.pages.map((p) => ({ path: p.path, content: p.draftContent })),
  );
  const now = new Date();

  await db.$transaction(async (tx) => {
    const keep = new Set(pages.map((p) => p.path));
    await tx.page.deleteMany({ where: { siteId: site.id, path: { notIn: [...keep] } } });
    for (const [i, page] of pages.entries()) {
      const data = { ...pageData({ ...page, content: mapped[i] as never }, i), draftUpdatedAt: now };
      await tx.page.upsert({
        where: { siteId_path: { siteId: site.id, path: page.path } },
        update: data,
        create: { siteId: site.id, ...data },
      });
    }
    await tx.site.update({
      where: { id: site.id },
      data: {
        themeDraft: toJson(parseTheme(version.theme)),
        templateId: template.id,
        templateVersionId: version.id,
      },
    });
  });
  return { value: { backupId: backup.id }, invalidate: [siteTag(site.id)] };
}

export async function listBackups(ownerId: string, siteId: string) {
  const site = await getOwnedSite(ownerId, siteId);
  return db.siteBackup.findMany({
    where: { siteId: site.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, reason: true, createdAt: true },
  });
}

type SnapshotPage = ReturnType<typeof snapshot>["pages"][number];

/** Restores a backup (the current state is backed up first, so a restore can be undone). */
export async function restoreBackup(ownerId: string, backupId: string): Promise<Result<void>> {
  const backup = await db.siteBackup.findFirst({ where: { id: backupId, site: { ownerId } } });
  if (!backup) throw new SiteError("notFound");
  const site = await getOwnedSite(ownerId, backup.siteId);
  await createBackup(site, "beforeRestore", ownerId);

  const data = backup.data as unknown as ReturnType<typeof snapshot>;
  const json = (value: unknown) => (value === null || value === undefined ? Prisma.JsonNull : toJson(value));
  await db.$transaction(async (tx) => {
    await tx.page.deleteMany({ where: { siteId: site.id } });
    await tx.page.createMany({
      data: data.pages.map((p: SnapshotPage) => ({
        siteId: site.id,
        path: p.path,
        title: p.title,
        position: p.position,
        draftContent: toJson(p.draftContent),
        publishedContent: json(p.publishedContent),
        publishedAt: p.publishedAt ? new Date(p.publishedAt) : null,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
        ogImageUrl: p.ogImageUrl,
        lockRules: json(p.lockRules),
      })),
    });
    await tx.site.update({
      where: { id: site.id },
      data: {
        themeDraft: json(data.themeDraft),
        themePublished: json(data.themePublished),
        templateId: data.templateId,
        templateVersionId: data.templateVersionId,
      },
    });
  });
  return { value: undefined, invalidate: [siteTag(site.id)] };
}
