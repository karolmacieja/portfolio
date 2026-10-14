import "server-only";

import { emptyContent, starterContent, type PageContent } from "@/blocks/content";
import { Prisma, SiteStatus, type SuspensionReason } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { validateSlug } from "@/lib/slug";

import { hostTag, siteTag } from "./cache-tags";
import { SiteError } from "./errors";
import { siteSubdomainHostname } from "./urls";

/**
 * Site operations. Every client-facing function takes `ownerId` and scopes its queries to it,
 * so a client can never read or change another client's site (tenant isolation).
 * Mutations return the cache tags to invalidate; callers (server actions) apply them.
 */

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
const toJson = (content: PageContent) => content as Prisma.InputJsonObject;

const ownedSite = (ownerId: string, siteId: string) => ({ id: siteId, ownerId });

export async function listSites(ownerId: string): Promise<SiteSummary[]> {
  const sites = await db.site.findMany({
    where: { ownerId },
    orderBy: { createdAt: "asc" },
    include: { pages: { select: { updatedAt: true, publishedAt: true } } },
  });
  return sites.map((site) => ({
    id: site.id,
    name: site.name,
    slug: site.slug,
    status: site.status,
    publishedAt: site.publishedAt,
    pageCount: site.pages.length,
    hasUnpublishedChanges: site.pages.some((p) => !p.publishedAt || p.updatedAt > p.publishedAt),
  }));
}

export async function getSite(ownerId: string, siteId: string) {
  const site = await db.site.findFirst({ where: ownedSite(ownerId, siteId) });
  if (!site) throw new SiteError("notFound");
  return site;
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
  const locale = input.locale ?? "pl";
  try {
    const site = await db.site.create({
      data: {
        ownerId,
        name: input.name,
        slug: input.slug,
        locale,
        pages: {
          create: {
            path: "",
            title: input.name,
            draftContent: toJson(input.content ?? emptyContent()),
          },
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

/** Copies every page's draft to its published content and marks the site as published. */
export async function publishSite(
  ownerId: string,
  siteId: string,
): Promise<MutationResult<{ publishedAt: Date }>> {
  const site = await getSite(ownerId, siteId);
  const pages = await db.page.findMany({
    where: { siteId: site.id },
    select: { id: true, draftContent: true },
  });
  if (pages.length === 0) throw new SiteError("nothingToPublish");

  const publishedAt = new Date();
  await db.$transaction([
    ...pages.map((page) =>
      db.page.update({
        where: { id: page.id },
        // updatedAt is set explicitly so "unpublished changes" compares equal right after publishing.
        data: { publishedContent: page.draftContent ?? Prisma.JsonNull, publishedAt, updatedAt: publishedAt },
      }),
    ),
    db.site.update({ where: { id: site.id }, data: { publishedAt } }),
  ]);
  return { value: { publishedAt }, invalidate: [siteTag(site.id)] };
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
