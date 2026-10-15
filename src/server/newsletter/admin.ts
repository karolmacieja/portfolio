import "server-only";

import { CampaignStatus, type CampaignType, type Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { enqueueNewsletterBatch } from "@/server/jobs/queues";
import { getMailer } from "@/server/mail";

import { audienceSchema, countAudience, type Audience } from "./audience";
import { buildCampaignMail } from "./render";
import { prepareCampaign } from "./sending";

/** Staff campaign management (not owner-scoped; permission `newsletter.manage`). */

export class NewsletterError extends Error {
  constructor(readonly code: "notFound" | "notEditable" | "emptyAudience" | "pastSchedule") {
    super(`Newsletter operation failed: ${code}`);
    this.name = "NewsletterError";
  }
}

export type CampaignInput = {
  subject: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  type: CampaignType;
  audience: Audience;
};

const EDITABLE: CampaignStatus[] = [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED];

export function listCampaigns() {
  return db.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
}

export async function getCampaign(id: string) {
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw new NewsletterError("notFound");
  return { ...campaign, audience: audienceSchema.parse(campaign.audience) };
}

export async function saveCampaign(id: string | null, input: CampaignInput, actorId: string) {
  const data = { ...input, audience: input.audience as Prisma.InputJsonObject };
  if (!id) return db.campaign.create({ data: { ...data, createdById: actorId } });
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw new NewsletterError("notFound");
  if (!EDITABLE.includes(campaign.status)) throw new NewsletterError("notEditable");
  return db.campaign.update({ where: { id }, data });
}

/** Schedules for `at` (null = now: the list is frozen and sending starts right away). */
export async function scheduleCampaign(id: string, at: Date | null, now = new Date()) {
  const campaign = await getCampaign(id);
  if (!EDITABLE.includes(campaign.status)) throw new NewsletterError("notEditable");
  if (at && at <= now) throw new NewsletterError("pastSchedule");
  if ((await countAudience(campaign.audience, campaign.type)) === 0)
    throw new NewsletterError("emptyAudience");
  await db.campaign.update({
    where: { id },
    data: { status: CampaignStatus.SCHEDULED, scheduledAt: at ?? now },
  });
  if (!at && (await prepareCampaign(id, now))) await enqueueNewsletterBatch(id);
}

/** Stops a scheduled or running campaign (recipients not reached yet stay unsent). */
export async function cancelCampaign(id: string) {
  const { count } = await db.campaign.updateMany({
    where: { id, status: { in: [CampaignStatus.SCHEDULED, CampaignStatus.SENDING, CampaignStatus.DRAFT] } },
    data: { status: CampaignStatus.CANCELED },
  });
  if (!count) throw new NewsletterError("notEditable");
}

export async function sendCampaignTest(
  id: string,
  to: { id: string; email: string; name: string | null; locale: string },
) {
  const campaign = await getCampaign(id);
  const mail = await buildCampaignMail(campaign, {
    userId: to.id,
    email: to.email,
    name: to.name,
    locale: to.locale,
  });
  await getMailer().send({ ...mail, subject: `[TEST] ${mail.subject}` });
}

export async function previewCampaign(
  id: string,
  viewer: { id: string; email: string; name: string | null; locale: string },
) {
  const campaign = await getCampaign(id);
  return buildCampaignMail(campaign, {
    userId: viewer.id,
    email: viewer.email,
    name: viewer.name,
    locale: viewer.locale,
  });
}

export { countAudience };
