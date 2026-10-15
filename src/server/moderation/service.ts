import "server-only";

import { createHash } from "node:crypto";

import { isLocale } from "@/i18n/config";
import {
  AbuseReportStatus,
  SiteStatus,
  SuspensionReason,
  type AbuseCategory,
  type Prisma,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getEnv, platformUrl } from "@/lib/env";
import { getMailer } from "@/server/mail";
import { buildLinkMail } from "@/server/mail/templates";
import { siteTag } from "@/server/sites/cache-tags";

/**
 * Content moderation (DSA notice and action): public reports, staff decisions with a statement of
 * reasons sent to the site owner (and to the reporter when they left an email), manual suspension.
 * Staff operations, not owner-scoped.
 */

export class ModerationError extends Error {
  constructor(readonly code: "notFound" | "alreadyResolved" | "notModerated") {
    super(code);
    this.name = "ModerationError";
  }
}

/** The reporter's IP is never stored, only a salted hash (to spot abuse of the form). */
export function reporterHash(ip: string): string {
  return createHash("sha256").update(`${getEnv().AUTH_SECRET}:report:${ip}`).digest("hex").slice(0, 32);
}

async function mail(
  to: string | null | undefined,
  locale: string,
  kind: "siteModerated" | "siteRestored" | "reportReceived" | "reportDecision",
  values: { domain?: string; reason?: string },
  url: string,
) {
  if (!to) return;
  try {
    await getMailer().send(
      await buildLinkMail({
        kind,
        to,
        url,
        locale: isLocale(locale) ? locale : "pl",
        brand: getEnv().BRAND_NAME,
        values,
      }),
    );
  } catch (error) {
    console.error(`Failed to send ${kind} mail`, error);
  }
}

export async function submitReport(input: {
  siteId: string;
  path: string;
  category: AbuseCategory;
  description: string;
  reporterEmail: string | null;
  ip: string;
}) {
  const site = await db.site.findUnique({ where: { id: input.siteId }, select: { id: true, name: true } });
  if (!site) throw new ModerationError("notFound");
  const report = await db.abuseReport.create({
    data: {
      siteId: site.id,
      path: input.path,
      category: input.category,
      description: input.description,
      reporterEmail: input.reporterEmail,
      reporterHash: reporterHash(input.ip),
    },
  });
  await mail(input.reporterEmail, "pl", "reportReceived", { domain: site.name }, platformUrl(undefined, "/"));
  return report;
}

export async function listReports(status: AbuseReportStatus | undefined, take = 100) {
  return db.abuseReport.findMany({
    where: status ? { status } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take,
    include: {
      site: {
        select: { id: true, name: true, slug: true, status: true, owner: { select: { email: true } } },
      },
    },
  });
}

/** Suspends a site for moderation with a statement of reasons and tells the owner. Returns cache tags. */
async function suspendForModeration(siteId: string, reason: string): Promise<string[]> {
  const site = await db.site.update({
    where: { id: siteId },
    data: {
      status: SiteStatus.SUSPENDED,
      suspensionReason: SuspensionReason.MODERATION,
      suspensionNote: reason,
      suspendedAt: new Date(),
    },
    include: { owner: { select: { email: true, locale: true } } },
  });
  await mail(
    site.owner.email,
    site.owner.locale,
    "siteModerated",
    { domain: site.name, reason },
    platformUrl("app", `/sites/${site.id}`),
  );
  return [siteTag(site.id)];
}

/**
 * Decides on a report: "suspend" takes the site down (moderation) with the reason, "dismiss" keeps it.
 * Open reports of the same site are resolved together when it is suspended. Returns cache tags.
 */
export async function resolveReport(
  actorId: string,
  reportId: string,
  decision: "suspend" | "dismiss",
  reason: string,
): Promise<{ tags: string[]; siteId: string }> {
  const report = await db.abuseReport.findUnique({ where: { id: reportId } });
  if (!report) throw new ModerationError("notFound");
  if (report.status !== AbuseReportStatus.OPEN) throw new ModerationError("alreadyResolved");
  const resolved: Prisma.AbuseReportUpdateManyMutationInput = {
    status: decision === "suspend" ? AbuseReportStatus.ACTIONED : AbuseReportStatus.DISMISSED,
    resolution: reason,
    resolvedById: actorId,
    resolvedAt: new Date(),
  };
  const affected = await db.abuseReport.findMany({
    where:
      decision === "suspend" ? { siteId: report.siteId, status: AbuseReportStatus.OPEN } : { id: report.id },
    select: { reporterEmail: true },
  });
  await db.abuseReport.updateMany({
    where:
      decision === "suspend" ? { siteId: report.siteId, status: AbuseReportStatus.OPEN } : { id: report.id },
    data: resolved,
  });
  const tags = decision === "suspend" ? await suspendForModeration(report.siteId, reason) : [];
  for (const { reporterEmail } of affected) {
    await mail(reporterEmail, "pl", "reportDecision", { reason }, platformUrl(undefined, "/"));
  }
  return { tags, siteId: report.siteId };
}

export async function listSitesForAdmin(filter: { q?: string; status?: SiteStatus }, take = 100) {
  return db.site.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: "insensitive" } },
              { slug: { contains: filter.q.toLowerCase() } },
              { owner: { email: { contains: filter.q, mode: "insensitive" } } },
              { domains: { some: { hostname: { contains: filter.q.toLowerCase() } } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      owner: { select: { id: true, email: true } },
      _count: { select: { pages: true, abuseReports: { where: { status: AbuseReportStatus.OPEN } } } },
    },
  });
}

/** Manual moderation from the sites list (no report). Returns cache tags. */
export async function moderateSite(siteId: string, suspend: boolean, reason: string): Promise<string[]> {
  const site = await db.site.findUnique({
    where: { id: siteId },
    include: { owner: { select: { email: true, locale: true } } },
  });
  if (!site) throw new ModerationError("notFound");
  if (suspend) return suspendForModeration(siteId, reason);
  if (site.suspensionReason !== SuspensionReason.MODERATION) throw new ModerationError("notModerated");
  await db.site.update({
    where: { id: siteId },
    data: { status: SiteStatus.ACTIVE, suspensionReason: null, suspensionNote: null, suspendedAt: null },
  });
  await mail(
    site.owner.email,
    site.owner.locale,
    "siteRestored",
    { domain: site.name, reason },
    platformUrl("app", `/sites/${site.id}`),
  );
  return [siteTag(siteId)];
}
