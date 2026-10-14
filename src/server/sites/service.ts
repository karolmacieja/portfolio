import "server-only";

import { isDeepStrictEqual } from "node:util";

import { emptyContent, starterContent, validatePageContent, type PageContent } from "@/blocks/content";
import { Prisma, SiteStatus, type SuspensionReason } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  canAddMore,
  countProjects,
  getBlockTiers,
  getEntitlements,
  newDisallowedBlocks,
} from "@/server/entitlements";
import { normalizePagePath, validatePagePath } from "@/lib/page-path";
import { validateSlug } from "@/lib/slug";
import { DEFAULT_THEME, parseTheme, themeSchema, type Theme } from "@/themes/theme";

import { hostTag, siteTag } from "./cache-tags";
import { SiteError } from "./errors";
import { siteSubdomainHostname } from "./urls";

/**
 * Site operations. Every client-facing function takes `ownerId` and scopes its queries to it,
 * so a client can never read or change another client's site (tenant isolation).
 * Mutations return the cache tags to invalidate; callers (server actions) apply them.
 *
 * Draft vs live: page content and the theme are edited as drafts and go live on publish.
 * Page structure (title, path, order, deletion), SEO fields and site settings apply immediately.
 *
 * Plan entitlements (src/server/entitlements) are enforced here, so no caller can bypass them:
 * site/page/project limits, block tiers and publishing. Existing data is never removed when a plan
 * shrinks; only adding beyond the limits is refused.
 */

export const MAX_VERSIONS_PER_PAGE = 20;

export type SiteSummary = {
  id: string;
  name: string;
  slug: string;
  status: SiteStatus;
  publishedAt: Date | null;
  hasUnpublishedChanges: boolean;
  pageCount: number;
};

export type MutationResult<T> = { value: T; invalidate: string[] };

// Content is validated by zod (JSON-safe by construction); Prisma's Json input type can't express that.
const toJson = (value: unknown) => value as Prisma.InputJsonObject;

const ownedSite = (ownerId: string, siteId: string) => ({ id: siteId, ownerId });

type PageState = { draftUpdatedAt: Date; publishedAt: Date | null };
const pageHasChanges = (page: PageState) => !page.publishedAt || page.draftUpdatedAt > page.publishedAt;
const themeHasChanges = (site: { themeDraft: unknown; themePublished: unknown }) =>
  site.themeDraft !== null && !isDeepStrictEqual(site.themeDraft, site.themePublished);

async function siteHosts(siteId: string, slug: string): Promise<string[]> {
  const domains = await db.domain.findMany({ where: { siteId }, select: { hostname: true } });
  return [siteSubdomainHostname(slug), ...domains.map((d) => d.hostname)];
}

// --- Sites ---------------------------------------------------------------------------------

export async function listSites(ownerId: string): Promise<SiteSummary[]> {
  const sites = await db.site.findMany({
    where: { ownerId },
    orderBy: { createdAt: "asc" },
    include: { pages: { select: { draftUpdatedAt: true, publishedAt: true } } },
  });
  return sites.map((site) => ({
    id: site.id,
    name: site.name,
    slug: site.slug,
    status: site.status,
    publishedAt: site.publishedAt,
    pageCount: site.pages.length,
    hasUnpublishedChanges: site.pages.some(pageHasChanges) || themeHasChanges(site),
  }));
}

export async function getSite(ownerId: string, siteId: string) {
  const site = await db.site.findFirst({ where: ownedSite(ownerId, siteId) });
  if (!site) throw new SiteError("notFound");
  return site;
}

export async function getSiteWithPages(ownerId: string, siteId: string) {
  const site = await db.site.findFirst({
    where: ownedSite(ownerId, siteId),
    include: { pages: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] } },
  });
  if (!site) throw new SiteError("notFound");
  return {
    ...site,
    theme: parseTheme(site.themeDraft ?? site.themePublished),
    hasUnpublishedChanges: site.pages.some(pageHasChanges) || themeHasChanges(site),
    pages: site.pages.map((page) => ({ ...page, hasUnpublishedChanges: pageHasChanges(page) })),
  };
}

export async function isSlugAvailable(slug: string): Promise<boolean> {
  if (!validateSlug(slug).ok) return false;
  return (await db.site.count({ where: { slug } })) === 0;
}

export async function createSite(
  ownerId: string,
  input: { name: string; slug: string; locale?: string; content?: PageContent },
): Promise<MutationResult<{ id: string; slug: string }>> {
  if (!validateSlug(input.slug).ok) throw new SiteError("slugInvalid");
  const entitlements = await getEntitlements(ownerId);
  if (!canAddMore(entitlements.limits.maxSites, await db.site.count({ where: { ownerId } }))) {
    throw new SiteError("limit.sites");
  }
  try {
    const site = await db.site.create({
      data: {
        ownerId,
        name: input.name,
        slug: input.slug,
        locale: input.locale ?? "pl",
        pages: {
          create: { path: "", title: input.name, draftContent: toJson(input.content ?? emptyContent()) },
        },
      },
    });
    // Drop a cached "no site on this host" lookup for the new subdomain.
    return {
      value: { id: site.id, slug: site.slug },
      invalidate: [hostTag(siteSubdomainHostname(site.slug))],
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SiteError("slugTaken");
    }
    throw error;
  }
}

/** Default draft for sites created without a template (until Phase 4). */
export function defaultSiteContent(name: string, texts: { subtitle: string; body: string }): PageContent {
  return starterContent({ title: name, subtitle: texts.subtitle, body: texts.body });
}

export type SiteSettingsInput = {
  name: string;
  slug: string;
  locale: "pl" | "en";
  description: string | null;
  noIndex: boolean;
  faviconUrl: string | null;
};

export async function updateSiteSettings(
  ownerId: string,
  siteId: string,
  input: SiteSettingsInput,
): Promise<MutationResult<void>> {
  const site = await getSite(ownerId, siteId);
  if (!validateSlug(input.slug).ok) throw new SiteError("slugInvalid");

  const hostsBefore = await siteHosts(site.id, site.slug);
  try {
    await db.site.update({ where: { id: site.id }, data: input });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SiteError("slugTaken");
    }
    throw error;
  }
  const hosts = input.slug === site.slug ? [] : [...hostsBefore, siteSubdomainHostname(input.slug)];
  return { value: undefined, invalidate: [siteTag(site.id), ...hosts.map(hostTag)] };
}

export async function saveThemeDraft(
  ownerId: string,
  siteId: string,
  theme: Theme,
): Promise<MutationResult<void>> {
  const site = await getSite(ownerId, siteId);
  const parsed = themeSchema.parse(theme);
  await db.site.update({ where: { id: site.id }, data: { themeDraft: toJson(parsed) } });
  return { value: undefined, invalidate: [] };
}

// --- Pages ---------------------------------------------------------------------------------

async function getOwnedPage(ownerId: string, pageId: string) {
  const page = await db.page.findFirst({ where: { id: pageId, site: { ownerId } }, include: { site: true } });
  if (!page) throw new SiteError("notFound");
  return page;
}

export async function getPageForEditing(ownerId: string, pageId: string) {
  const page = await getOwnedPage(ownerId, pageId);
  const pages = await db.page.findMany({
    where: { siteId: page.siteId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, path: true },
  });
  return {
    page,
    site: page.site,
    pages,
    theme: parseTheme(page.site.themeDraft ?? page.site.themePublished ?? DEFAULT_THEME),
  };
}

/**
 * Saves the editor's draft. Content is strictly validated (unknown blocks, bad links, ...) and
 * checked against the plan: no newly added blocks above the plan's tier, no growth past the
 * project limit (counted across the site's drafts).
 */
export async function savePageDraft(
  ownerId: string,
  pageId: string,
  content: unknown,
): Promise<MutationResult<void>> {
  const page = await getOwnedPage(ownerId, pageId);
  const validation = validatePageContent(content);
  if (!validation.ok) throw new SiteError("invalidContent", validation.issues);

  const [entitlements, tiers] = await Promise.all([getEntitlements(ownerId), getBlockTiers()]);
  const disallowed = newDisallowedBlocks(
    validation.content,
    [page.draftContent, page.publishedContent],
    entitlements,
    tiers,
  );
  if (disallowed.length > 0) throw new SiteError("blockNotAllowed", disallowed);

  if (entitlements.limits.maxProjects !== null) {
    const others = await db.page.findMany({
      where: { siteId: page.siteId, id: { not: page.id } },
      select: { draftContent: true },
    });
    const otherProjects = others.reduce((sum, p) => sum + countProjects(p.draftContent), 0);
    const before = otherProjects + countProjects(page.draftContent);
    const after = otherProjects + countProjects(validation.content);
    if (after > entitlements.limits.maxProjects && after > before) throw new SiteError("limit.projects");
  }

  await db.page.update({
    where: { id: page.id },
    data: { draftContent: toJson(validation.content), draftUpdatedAt: new Date() },
  });
  return { value: undefined, invalidate: [] };
}

function checkPath(input: string): string {
  const path = normalizePagePath(input);
  const result = validatePagePath(path);
  if (!result.ok) throw new SiteError(`path.${result.error}`);
  return path;
}

export async function createPage(
  ownerId: string,
  siteId: string,
  input: { title: string; path: string },
): Promise<MutationResult<{ id: string }>> {
  const site = await getSite(ownerId, siteId);
  const path = checkPath(input.path);
  const entitlements = await getEntitlements(ownerId);
  if (!canAddMore(entitlements.limits.maxPagesPerSite, await db.page.count({ where: { siteId: site.id } }))) {
    throw new SiteError("limit.pages");
  }
  const last = await db.page.aggregate({ where: { siteId: site.id }, _max: { position: true } });
  try {
    const page = await db.page.create({
      data: {
        siteId: site.id,
        title: input.title,
        path,
        position: (last._max.position ?? 0) + 1,
        draftContent: toJson(emptyContent()),
      },
    });
    // Unpublished pages are not visible, nothing to invalidate.
    return { value: { id: page.id }, invalidate: [] };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SiteError("pathTaken");
    }
    throw error;
  }
}

export type PageMetaInput = {
  title: string;
  path: string;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
};

export async function updatePageMeta(
  ownerId: string,
  pageId: string,
  input: PageMetaInput,
): Promise<MutationResult<void>> {
  const page = await getOwnedPage(ownerId, pageId);
  // The home page always lives at "/".
  const path = page.path === "" ? "" : checkPath(input.path);
  try {
    await db.page.update({ where: { id: page.id }, data: { ...input, path } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SiteError("pathTaken");
    }
    throw error;
  }
  return { value: undefined, invalidate: [siteTag(page.siteId)] };
}

export async function deletePage(ownerId: string, pageId: string): Promise<MutationResult<void>> {
  const page = await getOwnedPage(ownerId, pageId);
  if (page.path === "") throw new SiteError("cannotDeleteHome");
  await db.page.delete({ where: { id: page.id } });
  return { value: undefined, invalidate: [siteTag(page.siteId)] };
}

export async function movePage(
  ownerId: string,
  pageId: string,
  direction: "up" | "down",
): Promise<MutationResult<void>> {
  const page = await getOwnedPage(ownerId, pageId);
  const pages = await db.page.findMany({
    where: { siteId: page.siteId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const index = pages.findIndex((p) => p.id === page.id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= pages.length) return { value: undefined, invalidate: [] };

  [pages[index], pages[target]] = [pages[target]!, pages[index]!];
  await db.$transaction(
    pages.map((p, position) => db.page.update({ where: { id: p.id }, data: { position } })),
  );
  return { value: undefined, invalidate: [siteTag(page.siteId)] };
}

// --- Publishing & versions -----------------------------------------------------------------

/**
 * Publishes the whole site: every page's draft and the theme draft go live. Pages whose draft
 * changed get a new version (the last MAX_VERSIONS_PER_PAGE are kept).
 */
export async function publishSite(
  ownerId: string,
  siteId: string,
  actorId: string = ownerId,
): Promise<MutationResult<{ publishedAt: Date }>> {
  const site = await getSite(ownerId, siteId);
  if (!(await getEntitlements(ownerId)).canPublish) throw new SiteError("subscriptionRequired");
  const pages = await db.page.findMany({
    where: { siteId: site.id },
    select: { id: true, title: true, draftContent: true, draftUpdatedAt: true, publishedAt: true },
  });
  if (pages.length === 0) throw new SiteError("nothingToPublish");

  const publishedAt = new Date();
  await db.$transaction(async (tx) => {
    for (const page of pages) {
      const changed = pageHasChanges(page);
      await tx.page.update({
        where: { id: page.id },
        data: {
          publishedContent: page.draftContent ?? Prisma.JsonNull,
          publishedAt,
          // Keeps "unpublished changes" false right after publishing.
          draftUpdatedAt: publishedAt,
        },
      });
      if (!changed) continue;

      const last = await tx.pageVersion.aggregate({ where: { pageId: page.id }, _max: { number: true } });
      const number = (last._max.number ?? 0) + 1;
      await tx.pageVersion.create({
        data: {
          pageId: page.id,
          number,
          title: page.title,
          content: page.draftContent ?? Prisma.JsonNull,
          createdById: actorId,
        },
      });
      await tx.pageVersion.deleteMany({
        where: { pageId: page.id, number: { lte: number - MAX_VERSIONS_PER_PAGE } },
      });
    }
    await tx.site.update({
      where: { id: site.id },
      data: { publishedAt, ...(site.themeDraft !== null ? { themePublished: toJson(site.themeDraft) } : {}) },
    });
  });
  return { value: { publishedAt }, invalidate: [siteTag(site.id)] };
}

export async function listVersions(ownerId: string, siteId: string) {
  const site = await getSite(ownerId, siteId);
  return db.page.findMany({
    where: { siteId: site.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      path: true,
      versions: {
        orderBy: { number: "desc" },
        select: { id: true, number: true, title: true, createdAt: true },
      },
    },
  });
}

/** Copies a published version back into the page draft; it goes live with the next publish. */
export async function restoreVersion(
  ownerId: string,
  versionId: string,
): Promise<MutationResult<{ pageId: string }>> {
  const version = await db.pageVersion.findFirst({
    where: { id: versionId, page: { site: { ownerId } } },
    select: { pageId: true, content: true },
  });
  if (!version) throw new SiteError("notFound");
  await db.page.update({
    where: { id: version.pageId },
    data: { draftContent: version.content ?? Prisma.JsonNull, draftUpdatedAt: new Date() },
  });
  return { value: { pageId: version.pageId }, invalidate: [] };
}

// --- Staff / billing -----------------------------------------------------------------------

/** Cache tags of all of a user's sites; invalidate when their plan changes (branding, access). */
export async function siteTagsForOwner(ownerId: string): Promise<string[]> {
  const sites = await db.site.findMany({ where: { ownerId }, select: { id: true } });
  return sites.map((site) => siteTag(site.id));
}

/** Staff/billing operation: replaces the public site with a notice. Not owner-scoped by design. */
export async function suspendSite(siteId: string, reason: SuspensionReason): Promise<MutationResult<void>> {
  await db.site.update({
    where: { id: siteId },
    data: { status: SiteStatus.SUSPENDED, suspensionReason: reason, suspendedAt: new Date() },
  });
  return { value: undefined, invalidate: [siteTag(siteId)] };
}

export async function unsuspendSite(siteId: string): Promise<MutationResult<void>> {
  await db.site.update({
    where: { id: siteId },
    data: { status: SiteStatus.ACTIVE, suspensionReason: null, suspendedAt: null },
  });
  return { value: undefined, invalidate: [siteTag(siteId)] };
}
