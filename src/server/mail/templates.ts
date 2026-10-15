import { createTranslator } from "next-intl";

import type { Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/messages";

import type { MailMessage } from "./types";

// Plain templates for auth mails. Phase 9 replaces them with React Email.

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

type LinkMailKind =
  "magicLink" | "verifyEmail" | "paymentFailed" | "paymentReminder" | "sitesSuspended" | "subscriptionEnded";

export async function buildLinkMail(params: {
  kind: LinkMailKind;
  to: string;
  url: string;
  locale: Locale;
  brand: string;
  values?: { days?: number };
}): Promise<MailMessage> {
  const messages = await loadMessages(params.locale);
  const t = createTranslator({ locale: params.locale, messages, namespace: `email.${params.kind}` });
  const values = { brand: params.brand, days: String(params.values?.days ?? "") };
  const parts = { intro: t("intro", values), cta: t("cta"), url: params.url, ignore: t("ignore") };
  return {
    to: params.to,
    subject: t("subject", { brand: params.brand }),
    text: `${parts.intro}\n\n${parts.url}\n\n${parts.ignore}`,
    html: layout(parts),
  };
}
