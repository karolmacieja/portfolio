import "server-only";

import { unstable_cache } from "next/cache";

import { getDevDomainSlug } from "@/lib/dev-domains";
import { getEnv } from "@/lib/env";
import { normalizeHostname } from "@/lib/hosts";
import { DomainStatus, SiteStatus, type SuspensionReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

import { hostTag, siteTag } from "./cache-tags";

/**
 * Read side for public rendering. Results are cached in the Next.js data cache and tagged,
 * so ISR pages of a site are regenerated only when the site changes (see cache-tags.ts).
 * Returned values must be JSON-serializable (no Date objects).
 */

// Safety net: cached entries are refreshed at least daily even without explicit invalidation.
const CACHE_TTL_SECONDS = 24 * 60 * 60;

export type PublishedSite = {
  id: string;
  name: string;
  locale: string;
  published: boolean;
  suspended: boolean;
  suspensionReason: SuspensionReason | null;
  description: string | null;
  noIndex: boolean;
  faviconUrl: string | null;
  /** Published theme JSON; parse with parseTheme(). */
  theme: unknown;
  navigation: { path: string; title: string; updatedAt: string }[];
};

export type PublishedPage = {
  path: string;
  title: string;
  content: unknown;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
};

async function findSiteIdByHost(hostname: string): Promise<string | null> {
  const env = getEnv();
  const root = normalizeHostname(env.ROOT_DOMAIN);
  let slug = getDevDomainSlug(hostname, env.APP_ENV);
  if (!slug && root && hostname.endsWith(`.${root}`)) {
    const label = hostname.slice(0, -(root.length + 1));
    if (!label.includes(".")) slug = label;
  }

  if (slug) {
    const site = await db.site.findUnique({ where: { slug }, select: { id: true } });
    return site?.id ?? null;
  }
  const domain = await db.domain.findUnique({
    where: { hostname },
    select: { siteId: true, status: true },
  });
  return domain?.status === DomainStatus.ACTIVE ? domain.siteId : null;
}

export function resolveSiteIdByHost(hostname: string): Promise<string | null> {
  return unstable_cache(() => findSiteIdByHost(hostname), ["site-id-by-host", hostname], {
    tags: [hostTag(hostname)],
    revalidate: CACHE_TTL_SECONDS,
  })();
}

export function getPublishedSite(siteId: string): Promise<PublishedSite | null> {
  return unstable_cache(
    async (): Promise<PublishedSite | null> => {
      const site = await db.site.findUnique({
        where: { id: siteId },
        include: {
          pages: {
            where: { publishedAt: { not: null } },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: { path: true, title: true, publishedAt: true },
          },
        },
      });
      if (!site) return null;
      return {
        id: site.id,
        name: site.name,
        locale: site.locale,
        published: site.publishedAt !== null,
        suspended: site.status === SiteStatus.SUSPENDED,
        suspensionReason: site.suspensionReason,
        description: site.description,
        noIndex: site.noIndex,
        faviconUrl: site.faviconUrl,
        theme: site.themePublished,
        navigation: site.pages.map((page) => ({
          path: page.path,
          title: page.title,
          updatedAt: (page.publishedAt ?? site.updatedAt).toISOString(),
        })),
      };
    },
    ["published-site", siteId],
    { tags: [siteTag(siteId)], revalidate: CACHE_TTL_SECONDS },
  )();
}

export function getPublishedPage(siteId: string, path: string): Promise<PublishedPage | null> {
  return unstable_cache(
    async (): Promise<PublishedPage | null> => {
      const page = await db.page.findUnique({
        where: { siteId_path: { siteId, path } },
        select: {
          path: true,
          title: true,
          publishedContent: true,
          seoTitle: true,
          seoDescription: true,
          ogImageUrl: true,
        },
      });
      if (!page || page.publishedContent === null) return null;
      return {
        path: page.path,
        title: page.title,
        content: page.publishedContent,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        ogImageUrl: page.ogImageUrl,
      };
    },
    ["published-page", siteId, path],
    { tags: [siteTag(siteId)], revalidate: CACHE_TTL_SECONDS },
  )();
}
