import { createTranslator } from "next-intl";

import type { Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";
import { platformUrl } from "@/lib/env";
import { getPlatformBranding } from "@/server/branding/settings";

import { getMailBranding } from "./branding";
import { renderLinkMail } from "./layout";
import { getMailOverrides } from "./overrides";
import type { MailMessage } from "./types";

// Transactional mails: texts from `messages.email.*` (admin overrides on top), React Email layout (layout.tsx).

export const LINK_MAIL_KINDS = [
  "magicLink",
  "verifyEmail",
  "paymentFailed",
  "paymentReminder",
  "sitesSuspended",
  "subscriptionEnded",
  "invoiceIssued",
  "correctionIssued",
  "domainActive",
  "domainsDisabledSoon",
  "domainsDisabled",
  "domainRegistered",
  "domainRenewalReminder",
  "domainRenewalFailed",
  "domainExpired",
  "siteModerated",
  "siteRestored",
  "reportReceived",
  "reportDecision",
  "contactMessage",
  "passwordReset",
  "accountDeletionScheduled",
  "accountDeleted",
  "licenseInvite",
  "licenseEnded",
] as const;

type LinkMailKind = (typeof LINK_MAIL_KINDS)[number];

export async function buildLinkMail(params: {
  kind: LinkMailKind;
  to: string;
  url: string;
  locale: Locale;
  brand: string;
  values?: {
    days?: number;
    number?: string;
    domain?: string;
    reason?: string;
    name?: string;
    email?: string;
  };
  /** Quoted user text (e.g. a contact message), shown verbatim below the intro. */
  quote?: string;
  replyTo?: string;
  attachments?: MailMessage["attachments"];
}): Promise<MailMessage> {
  const defaults = await loadMessages(params.locale);
  // The admin's service name (branding) wins over the environment name callers pass.
  const brand = (await getPlatformBranding()).name || params.brand;
  const override = (await getMailOverrides())[params.locale]?.[params.kind];
  const values = {
    brand,
    days: String(params.values?.days ?? ""),
    number: params.values?.number ?? "",
    domain: params.values?.domain ?? "",
    reason: params.values?.reason ?? "",
    name: params.values?.name ?? "",
    email: params.values?.email ?? "",
  };
  const render = (messages: typeof defaults, strict = false) => {
    const t = createTranslator({
      locale: params.locale,
      messages,
      namespace: `email.${params.kind}`,
      // Overrides fail loudly (and fall back below) instead of mailing a message key.
      ...(strict
        ? {
            onError: (error: Error) => {
              throw error;
            },
          }
        : {}),
    });
    return { subject: t("subject", values), intro: t("intro", values), cta: t("cta"), ignore: t("ignore") };
  };
  let texts = render(defaults);
  if (override) {
    // Admin-edited texts; a broken placeholder must never stop a mail, so fall back to the defaults.
    try {
      texts = render(
        {
          ...defaults,
          email: { ...defaults.email, [params.kind]: { ...defaults.email[params.kind], ...override } },
        },
        true,
      );
    } catch (error) {
      console.error(`Invalid mail text override for ${params.locale}/${params.kind}`, error);
    }
  }
  const footer = createTranslator({ locale: params.locale, messages: defaults, namespace: "email" })(
    "footer",
    {
      brand,
    },
  );
  const branding = await getMailBranding();
  const { html, text } = await renderLinkMail({
    branding,
    brand,
    homeUrl: platformUrl(undefined, "/"),
    locale: params.locale,
    intro: texts.intro,
    ...(params.quote ? { quote: params.quote } : {}),
    cta: texts.cta,
    url: params.url,
    ignore: texts.ignore,
    footer,
  });
  return {
    to: params.to,
    subject: texts.subject,
    text,
    html,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    ...(params.attachments ? { attachments: params.attachments } : {}),
  };
}
