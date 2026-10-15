import "server-only";

import { unstable_cache } from "next/cache";

import { getDevDomainSlug } from "@/lib/dev-domains";
import { getEnv } from "@/lib/env";
import { normalizeHostname } from "@/lib/hosts";
import {
  DomainStatus,
  SiteStatus,
  SponsorRemovalStatus,
  type LicenseSource,
  type LicenseStatus,
  type SuspensionReason,
} from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { can, getEntitlements, isLicenseActive } from "@/server/entitlements";

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
  /** "Made with {BRAND}" footer; hidden on plans with the removeBranding feature. */
  showBranding: boolean;
  /** Plan feature `analytics`: published pages carry the cookie-less view beacon. */
  analytics: boolean;
  /** "Supported by" footer of the owner's group license (null when off, hidden or bought out). */
  sponsor: { name: string; url: string | null } | null;
  /** Published theme JSON; parse with parseTheme(). */
  theme: unknown;
  navigation: { path: string; title: string; updatedAt: string }[];
  /** Active primary custom domain: every other host of the site redirects to it. */
  primaryHost: string | null;
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

type SponsorOwner = {
  membership: {
    sponsorFooterHidden: boolean;
    organization: {
      status: LicenseStatus;
      source: LicenseSource;
      validUntil: Date | null;
      sponsorFooter: boolean;
      sponsorName: string | null;
      sponsorUrl: string | null;
    };
  } | null;
  sponsorRemoval: { status: SponsorRemovalStatus } | null;
};

/**
 * The sponsor footer shows on sites of members of an active license with a sponsor name, unless staff
 * switched it off (for the license or the member) or the member paid to remove it.
 */
export function sponsorOf(owner: SponsorOwner): PublishedSite["sponsor"] {
  const member = owner.membership;
  if (!member || member.sponsorFooterHidden) return null;
  const org = member.organization;
  if (!org.sponsorFooter || !org.sponsorName || !isLicenseActive(org)) return null;
  if (owner.sponsorRemoval?.status === SponsorRemovalStatus.ACTIVE) return null;
  return { name: org.sponsorName, url: org.sponsorUrl };
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
          domains: {
            where: { isPrimary: true, status: DomainStatus.ACTIVE },
            select: { hostname: true },
            take: 1,
          },
          owner: {
            select: {
              deletionScheduledAt: true,
              membership: { select: { sponsorFooterHidden: true, organization: true } },
              sponsorRemoval: { select: { status: true } },
            },
          },
        },
      });
      if (!site) return null;
      const entitlements = await getEntitlements(site.ownerId);
      return {
        id: site.id,
        name: site.name,
        locale: site.locale,
        // A pending account deletion takes the client's sites offline at once.
        published: site.publishedAt !== null && !site.owner.deletionScheduledAt,
        suspended: site.status === SiteStatus.SUSPENDED,
        suspensionReason: site.suspensionReason,
        description: site.description,
        noIndex: site.noIndex,
        faviconUrl: site.faviconUrl,
        showBranding: !can(entitlements, "removeBranding"),
        analytics: can(entitlements, "analytics"),
        sponsor: sponsorOf(site.owner),
        theme: site.themePublished,
        navigation: site.pages.map((page) => ({
          path: page.path,
          title: page.title,
          updatedAt: (page.publishedAt ?? site.updatedAt).toISOString(),
        })),
        primaryHost: site.domains[0]?.hostname ?? null,
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
