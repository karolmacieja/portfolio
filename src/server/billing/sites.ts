import { SiteStatus, SuspensionReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { siteTag } from "@/server/sites/cache-tags";

/** Suspends a client's live sites for non-payment; returns the cache tags to invalidate. */
export async function suspendSitesForPayment(userId: string): Promise<string[]> {
  const sites = await db.site.findMany({
    where: { ownerId: userId, status: SiteStatus.ACTIVE },
    select: { id: true },
  });
  if (sites.length === 0) return [];
  await db.site.updateMany({
    where: { id: { in: sites.map((s) => s.id) } },
    data: {
      status: SiteStatus.SUSPENDED,
      suspensionReason: SuspensionReason.PAYMENT,
      suspendedAt: new Date(),
    },
  });
  return sites.map((s) => siteTag(s.id));
}

/** Restores sites suspended for non-payment (moderation suspensions stay). */
export async function restoreSitesAfterPayment(userId: string): Promise<string[]> {
  const sites = await db.site.findMany({
    where: { ownerId: userId, status: SiteStatus.SUSPENDED, suspensionReason: SuspensionReason.PAYMENT },
    select: { id: true },
  });
  if (sites.length === 0) return [];
  await db.site.updateMany({
    where: { id: { in: sites.map((s) => s.id) } },
    data: { status: SiteStatus.ACTIVE, suspensionReason: null, suspendedAt: null },
  });
  return sites.map((s) => siteTag(s.id));
}

export async function allSiteTags(userId: string): Promise<string[]> {
  const sites = await db.site.findMany({ where: { ownerId: userId }, select: { id: true } });
  return sites.map((s) => siteTag(s.id));
}
