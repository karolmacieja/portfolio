import type { Metadata } from "next";
import Link from "next/link";

import { getTranslator } from "@/i18n/translator";
import { getEnv } from "@/lib/env";
import { parseTheme, themeToCssVars } from "@/themes/theme";

import { loadSiteForHost } from "./data";

import "../site.css";

export async function generateMetadata({ params }: LayoutProps<"/sites/[host]">): Promise<Metadata> {
  const site = await loadSiteForHost((await params).host);
  if (!site) return {};
  return {
    title: { default: site.name, template: `%s · ${site.name}` },
    description: site.description ?? undefined,
    icons: site.faviconUrl ? { icon: site.faviconUrl } : undefined,
    robots: site.noIndex || site.suspended ? { index: false, follow: false } : undefined,
  };
}

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
  const theme = parseTheme(site?.theme);
  const navigation = site && !site.suspended ? site.navigation : [];

  return (
    <html lang={locale}>
      <body className="site-root flex min-h-dvh flex-col" style={themeToCssVars(theme)}>
        {navigation.length > 1 && (
          <header className="site-section !py-5">
            <nav
              aria-label={t("site.navigation")}
              className="site-container flex flex-wrap items-center gap-x-6 gap-y-2"
            >
              <Link href="/" className="site-heading mr-auto text-lg">
                {site?.name}
              </Link>
              {navigation.map((page) => (
                <Link key={page.path} href={`/${page.path}`} className="hover:opacity-70">
                  {page.title}
                </Link>
              ))}
            </nav>
          </header>
        )}
        <div className="flex-1">{children}</div>
        {(site?.showBranding ?? true) && (
          <footer className="site-muted px-6 py-6 text-center text-xs" data-testid="site-branding">
            {t("site.madeWith", { brand })}
          </footer>
        )}
      </body>
    </html>
  );
}
