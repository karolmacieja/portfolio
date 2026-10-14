import { getEnv } from "@/lib/env";
import { getTranslator } from "@/i18n/translator";

import { loadSiteForHost } from "./data";

import "../site.css";

/**
 * Root layout for published client sites (separate from the platform layout: no cookies,
 * no session, so pages can be served from the ISR cache).
 */
export default async function SiteLayout({ children, params }: LayoutProps<"/sites/[host]">) {
  const { host } = await params;
  const site = await loadSiteForHost(host);
  const locale = site?.locale ?? "pl";
  const t = await getTranslator(locale);
  const brand = getEnv().BRAND_NAME;

  return (
    <html lang={locale}>
      <body className="flex min-h-dvh flex-col">
        <div className="flex-1">{children}</div>
        {/* Shown on every site until plans (Phase 3) can remove it. */}
        <footer className="px-6 py-6 text-center text-xs opacity-60">{t("site.madeWith", { brand })}</footer>
      </body>
    </html>
  );
}
