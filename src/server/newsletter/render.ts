import { CampaignType } from "@/generated/prisma/client";
import { defaultLocale, isLocale } from "@/i18n/config";
import { getTranslator } from "@/i18n/translator";
import { getEnv, platformUrl } from "@/lib/env";
import { createSignedToken } from "@/lib/signed-token";
import { getBrandName } from "@/server/branding/settings";
import { getMailBranding } from "@/server/mail/branding";
import { renderCampaignMail } from "@/server/mail/layout";
import type { MailMessage } from "@/server/mail/types";

/** Builds one recipient's campaign mail: {name} filled in, branded layout, one-click unsubscribe for marketing. */

export const UNSUBSCRIBE_PURPOSE = "unsubscribe";
const UNSUBSCRIBE_TTL_SECONDS = 2 * 365 * 86_400;

export function unsubscribeToken(userId: string, campaignId: string | null): string {
  return createSignedToken(
    { userId, campaignId },
    getEnv().AUTH_SECRET,
    UNSUBSCRIBE_PURPOSE,
    UNSUBSCRIBE_TTL_SECONDS,
  );
}

export type CampaignContent = {
  id: string;
  subject: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  type: CampaignType;
};

export async function buildCampaignMail(
  campaign: CampaignContent,
  recipient: { userId: string | null; email: string; name: string | null; locale: string },
): Promise<MailMessage> {
  const locale = isLocale(recipient.locale) ? recipient.locale : defaultLocale;
  const t = await getTranslator(locale);
  const fill = (text: string) =>
    text.replaceAll("{name}", recipient.name?.trim() || t("newsletter.mail.friend"));
  const brand = await getBrandName();
  const marketing = campaign.type === CampaignType.MARKETING && recipient.userId;
  const token = marketing ? unsubscribeToken(recipient.userId!, campaign.id) : null;
  const unsubscribePage = token
    ? platformUrl("app", `/unsubscribe?token=${encodeURIComponent(token)}`)
    : null;
  const oneClick = token
    ? platformUrl("app", `/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`)
    : null;

  const { html, text } = await renderCampaignMail({
    brand,
    homeUrl: platformUrl(undefined, "/"),
    locale,
    body: fill(campaign.body),
    cta: campaign.ctaLabel && campaign.ctaUrl ? { label: campaign.ctaLabel, url: campaign.ctaUrl } : null,
    footer: t(
      campaign.type === CampaignType.MARKETING
        ? "newsletter.mail.footerMarketing"
        : "newsletter.mail.footerService",
      {
        brand,
      },
    ),
    branding: await getMailBranding(),
    unsubscribe: unsubscribePage
      ? { url: unsubscribePage, label: t("newsletter.mail.unsubscribe"), reason: t("newsletter.mail.reason") }
      : null,
  });
  return {
    to: recipient.email,
    subject: fill(campaign.subject),
    html,
    text,
    ...(oneClick
      ? {
          headers: {
            "List-Unsubscribe": `<${oneClick}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      : {}),
  };
}
