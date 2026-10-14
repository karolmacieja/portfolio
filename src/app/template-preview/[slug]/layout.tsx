import type { Metadata } from "next";
import Link from "next/link";

import { parseTemplatePages } from "@/server/templates/schema";
import { getTemplatePreview } from "@/server/templates/public";
import { parseTheme, themeToCssVars } from "@/themes/theme";

import "../../sites/site.css";

export async function generateMetadata({
  params,
}: LayoutProps<"/template-preview/[slug]">): Promise<Metadata> {
  const preview = await getTemplatePreview((await params).slug);
  return { title: preview?.name ?? "Template", robots: { index: false, follow: false } };
}

/**
 * Public preview of a published template version (gallery "Preview", thumbnail screenshots).
 * Separate root layout: same styles as client sites, no panel chrome, no cookies.
 */
export default async function TemplatePreviewLayout({
  children,
  params,
}: LayoutProps<"/template-preview/[slug]">) {
  const { slug } = await params;
  const preview = await getTemplatePreview(slug);
  const pages = preview ? parseTemplatePages(preview.pages) : [];
  const theme = parseTheme(preview?.theme);

  return (
    <html lang="pl">
      <body className="site-root flex min-h-dvh flex-col" style={themeToCssVars(theme)}>
        {pages.length > 1 && (
          <header className="site-section !py-5">
            <nav className="site-container flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="site-heading mr-auto text-lg">{preview?.name}</span>
              {pages.map((page) => (
                <Link
                  key={page.key}
                  href={`/template-preview/${slug}/${page.path}`}
                  className="hover:opacity-70"
                >
                  {page.title}
                </Link>
              ))}
            </nav>
          </header>
        )}
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
