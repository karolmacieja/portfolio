import type { SiteRenderMetadata } from "@/blocks/render/blocks";
import { getTranslator } from "@/i18n/translator";

/** System texts blocks need on a published site, in the site's language (Puck `metadata`). */
export async function siteRenderMetadata(locale: string): Promise<SiteRenderMetadata> {
  const t = await getTranslator(locale);
  const keys = ["name", "email", "message", "submit", "sent", "error", "honeypot"] as const;
  return {
    contact: Object.fromEntries(
      keys.map((key) => [key, t(`site.contact.${key}`)]),
    ) as SiteRenderMetadata["contact"],
    download: t("site.download"),
  };
}
