import "server-only";

import { createHash } from "node:crypto";

import { SiteStatus } from "@/generated/prisma/enums";
import { walkBlocks } from "@/blocks/content";
import { db } from "@/lib/db";
import { getEnv, platformUrl } from "@/lib/env";
import { defaultLocale, isLocale } from "@/i18n/config";
import { getMailer } from "@/server/mail";
import { buildLinkMail } from "@/server/mail/templates";
import { getRateLimiter, RATE_LIMITS } from "@/server/rate-limit/limiter";
import { resolveSiteIdByHost } from "@/server/sites/public";

/**
 * Contact form messages from published sites. Public submission is resolved by host (never by an id from
 * the form), accepted only for a published, active page that contains a ContactForm block, and rate
 * limited per sender and per site. Reading and deleting are owner-scoped.
 */

export const CONTACT_LIMITS = { name: 200, email: 200, message: 5000, maxLinks: 3 } as const;

export type ContactSubmission = {
  host: string;
  path: string;
  name: string;
  email: string;
  message: string;
  ip: string;
};
export type ContactResult = "sent" | "invalid" | "rateLimited" | "notAccepted";

export function senderHash(ip: string): string {
  return createHash("sha256").update(`${getEnv().AUTH_SECRET}:contact:${ip}`).digest("hex").slice(0, 32);
}

const LINK = /(https?:\/\/|www\.)/gi;

export async function submitContactMessage(input: ContactSubmission): Promise<ContactResult> {
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();
  if (
    !name ||
    name.length > CONTACT_LIMITS.name ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > CONTACT_LIMITS.email ||
    message.length < 2 ||
    message.length > CONTACT_LIMITS.message ||
    (message.match(LINK)?.length ?? 0) > CONTACT_LIMITS.maxLinks
  ) {
    return "invalid";
  }

  const siteId = await resolveSiteIdByHost(input.host);
  if (!siteId) return "notAccepted";
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      name: true,
      status: true,
      publishedAt: true,
      owner: { select: { email: true, locale: true, deletedAt: true } },
      pages: { where: { path: input.path }, select: { publishedContent: true } },
    },
  });
  const content = site?.pages[0]?.publishedContent;
  if (!site || !content || site.status !== SiteStatus.ACTIVE || !site.publishedAt || site.owner.deletedAt) {
    return "notAccepted";
  }
  let hasForm = false;
  walkBlocks(content, (block) => {
    if (block.type === "ContactForm") hasForm = true;
  });
  if (!hasForm) return "notAccepted";

  const hash = senderHash(input.ip);
  const limiter = getRateLimiter();
  const perSender = RATE_LIMITS.contactPerSender;
  const perSite = RATE_LIMITS.contactPerSite;
  if (
    !(await limiter.hit(`contact:${hash}`, perSender.limit, perSender.windowMs)).allowed ||
    !(await limiter.hit(`contact-site:${site.id}`, perSite.limit, perSite.windowMs)).allowed
  ) {
    return "rateLimited";
  }

  await db.contactMessage.create({
    data: { siteId: site.id, path: input.path, name, email, message, senderHash: hash },
  });
  try {
    const mail = await buildLinkMail({
      kind: "contactMessage",
      to: site.owner.email,
      url: platformUrl("app", "/messages"),
      locale: isLocale(site.owner.locale) ? site.owner.locale : defaultLocale,
      brand: getEnv().BRAND_NAME,
      values: { domain: site.name, name, email },
      quote: message,
      replyTo: email,
    });
    await getMailer().send(mail);
  } catch (error) {
    // The message is stored and visible in the panel; a mail failure must not lose it.
    console.error("[contact] owner notification failed", error);
  }
  return "sent";
}

// Owner-scoped inbox.

export function listContactMessages(ownerId: string, filter: { siteId?: string } = {}, take = 100) {
  return db.contactMessage.findMany({
    where: { site: { ownerId }, ...(filter.siteId ? { siteId: filter.siteId } : {}) },
    orderBy: { createdAt: "desc" },
    take,
    include: { site: { select: { id: true, name: true, slug: true } } },
  });
}

export function countUnreadMessages(ownerId: string) {
  return db.contactMessage.count({ where: { site: { ownerId }, readAt: null } });
}

export async function setMessageRead(ownerId: string, messageId: string, read: boolean) {
  const { count } = await db.contactMessage.updateMany({
    where: { id: messageId, site: { ownerId } },
    data: { readAt: read ? new Date() : null },
  });
  return count > 0;
}

export async function deleteContactMessage(ownerId: string, messageId: string) {
  const { count } = await db.contactMessage.deleteMany({ where: { id: messageId, site: { ownerId } } });
  return count > 0;
}
