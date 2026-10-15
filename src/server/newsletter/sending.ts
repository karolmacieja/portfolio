import { CampaignStatus, CampaignType, RecipientStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { Mailer } from "@/server/mail/types";

import { audienceSchema, audienceWhere } from "./audience";
import { buildCampaignMail } from "./render";

/**
 * Campaign sending (worker; worker-safe). Due campaigns get their recipient list frozen once, then batches are
 * sent until nobody is pending. Every step is resumable: a crashed batch leaves recipients PENDING.
 */

export const BATCH_SIZE = 50;

export type NewsletterDeps = {
  mailer: Mailer;
  enqueueBatch: (campaignId: string, delayMs?: number) => Promise<void> | void;
  now?: () => Date;
};

/** Freezes the audience of a campaign and marks it SENDING. Idempotent. */
export async function prepareCampaign(campaignId: string, now = new Date()): Promise<boolean> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== CampaignStatus.SCHEDULED) return false;
  const audience = audienceSchema.parse(campaign.audience);
  const users = await db.user.findMany({
    where: audienceWhere(audience, campaign.type),
    select: { id: true, email: true },
  });
  await db.$transaction([
    db.campaignRecipient.createMany({
      data: users.map((u) => ({ campaignId, userId: u.id, email: u.email })),
      skipDuplicates: true,
    }),
    db.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.SENDING, startedAt: now, recipientsCount: users.length },
    }),
  ]);
  return true;
}

/** Worker, every minute: campaigns whose time has come start sending. */
export async function startDueCampaigns(deps: NewsletterDeps): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const due = await db.campaign.findMany({
    where: { status: CampaignStatus.SCHEDULED, scheduledAt: { lte: now } },
    select: { id: true },
  });
  for (const { id } of due) {
    if (await prepareCampaign(id, now)) await deps.enqueueBatch(id);
  }
  return due.length;
}

/** Sends one batch; returns how many recipients are still pending (the worker schedules the next batch). */
export async function sendCampaignBatch(campaignId: string, deps: NewsletterDeps): Promise<number> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== CampaignStatus.SENDING) return 0;
  const batch = await db.campaignRecipient.findMany({
    where: { campaignId, status: RecipientStatus.PENDING },
    take: BATCH_SIZE,
  });
  const users = await db.user.findMany({
    where: { id: { in: batch.map((r) => r.userId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, name: true, locale: true, marketingConsent: true, deletedAt: true, blockedAt: true },
  });
  let sent = 0;
  let failed = 0;
  for (const recipient of batch) {
    const user = users.find((u) => u.id === recipient.userId);
    // Consent may have been withdrawn (or the account closed) since the list was frozen.
    if (
      !user ||
      user.deletedAt ||
      user.blockedAt ||
      (campaign.type === CampaignType.MARKETING && !user.marketingConsent)
    ) {
      await db.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: RecipientStatus.SKIPPED },
      });
      continue;
    }
    try {
      await deps.mailer.send(
        await buildCampaignMail(campaign, {
          userId: user.id,
          email: recipient.email,
          name: user.name,
          locale: user.locale,
        }),
      );
      await db.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: RecipientStatus.SENT, sentAt: deps.now?.() ?? new Date() },
      });
      sent++;
    } catch (error) {
      failed++;
      await db.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: RecipientStatus.FAILED,
          error: String((error as Error).message ?? error).slice(0, 500),
        },
      });
    }
  }
  const remaining = await db.campaignRecipient.count({
    where: { campaignId, status: RecipientStatus.PENDING },
  });
  await db.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount: { increment: sent },
      failedCount: { increment: failed },
      ...(remaining === 0 ? { status: CampaignStatus.SENT, sentAt: deps.now?.() ?? new Date() } : {}),
    },
  });
  return remaining;
}

/** Withdraws marketing consent (unsubscribe link); counts it for the campaign it came from. */
export async function unsubscribe(userId: string, campaignId: string | null): Promise<boolean> {
  const { count } = await db.user.updateMany({
    where: { id: userId, marketingConsent: true },
    data: { marketingConsent: false, marketingConsentAt: null },
  });
  if (count && campaignId) {
    await db.campaign.updateMany({ where: { id: campaignId }, data: { unsubscribes: { increment: 1 } } });
  }
  return count > 0;
}
