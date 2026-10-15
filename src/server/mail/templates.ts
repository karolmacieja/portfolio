import { createTranslator } from "next-intl";

import type { Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";

import { getMailOverrides } from "./overrides";
import type { MailMessage } from "./types";

// Plain templates for auth and billing mails. Phase 9 replaces them with React Email.

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(parts: { intro: string; cta: string; url: string; ignore: string }): string {
  const url = escapeHtml(parts.url);
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
<p>${escapeHtml(parts.intro)}</p>
<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(parts.cta)}</a></p>
<p style="font-size:12px;color:#555">${url}</p>
<p style="font-size:12px;color:#555">${escapeHtml(parts.ignore)}</p>
</body></html>`;
}

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
] as const;

type LinkMailKind =
  | "magicLink"
  | "verifyEmail"
  | "paymentFailed"
  | "paymentReminder"
  | "sitesSuspended"
  | "subscriptionEnded"
  | "invoiceIssued"
  | "correctionIssued"
  | "domainActive"
  | "domainsDisabledSoon"
  | "domainsDisabled"
  | "domainRegistered"
  | "domainRenewalReminder"
  | "domainRenewalFailed"
  | "domainExpired"
  | "siteModerated"
  | "siteRestored"
  | "reportReceived"
  | "reportDecision";

export async function buildLinkMail(params: {
  kind: LinkMailKind;
  to: string;
  url: string;
  locale: Locale;
  brand: string;
  values?: { days?: number; number?: string; domain?: string; reason?: string };
  attachments?: MailMessage["attachments"];
}): Promise<MailMessage> {
  const defaults = await loadMessages(params.locale);
  const override = (await getMailOverrides())[params.locale]?.[params.kind];
  const values = {
    brand: params.brand,
    days: String(params.values?.days ?? ""),
    number: params.values?.number ?? "",
    domain: params.values?.domain ?? "",
    reason: params.values?.reason ?? "",
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
  const parts = { intro: texts.intro, cta: texts.cta, url: params.url, ignore: texts.ignore };
  return {
    to: params.to,
    subject: texts.subject,
    text: `${parts.intro}\n\n${parts.url}\n\n${parts.ignore}`,
    html: layout(parts),
    ...(params.attachments ? { attachments: params.attachments } : {}),
  };
}
