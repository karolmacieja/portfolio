import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Render } from "@puckeditor/core/rsc";

import { renderConfig } from "@/blocks/config";
import { parseRenderableContent } from "@/blocks/content";
import { getTranslator } from "@/i18n/translator";
import { getPublishedPage } from "@/server/sites/public";
import { siteRenderMetadata } from "@/server/sites/render-metadata";
import { customDomainUrl } from "@/server/sites/urls";

import { loadSiteForHost } from "../data";

// ISR: pages render on first visit and are cached until the site's cache tag is invalidated
// (publish, suspension). The daily revalidation is only a safety net.
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Params = PageProps<"/sites/[host]/[[...path]]">["params"];

async function load(params: Params) {
  const { host, path } = await params;
  const site = await loadSiteForHost(host);
  if (!site || !site.published) return null;
  const pagePath = (path ?? []).map((segment) => decodeURIComponent(segment)).join("/");
  // A site with an active primary domain is served only there; the subdomain and other domains redirect.
  if (site.primaryHost && decodeURIComponent(host) !== site.primaryHost) {
    permanentRedirect(customDomainUrl(site.primaryHost, `/${(path ?? []).join("/")}`));
  }
  const page = site.suspended ? null : await getPublishedPage(site.id, pagePath);
  return { site, page };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await load(params);
  if (!data?.page) return {};
  const { page, site } = data;
  // Layout title template appends the site name; the home page uses the site name alone.
  const title = page.seoTitle || (page.path === "" ? { absolute: site.name } : page.title);
  const description = page.seoDescription || site.description || undefined;
  return {
    title,
    description,
    openGraph: {
      title: page.seoTitle || page.title,
      description,
      siteName: site.name,
      images: page.ogImageUrl ? [page.ogImageUrl] : undefined,
    },
  };
}

export default async function SitePage({ params }: { params: Params }) {
  const data = await load(params);
  if (!data) notFound();

  if (data.site.suspended) {
    const t = await getTranslator(data.site.locale);
    return (
      <main
        className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center"
        data-testid="site-suspended"
      >
        <h1 className="text-2xl font-semibold">{t("site.suspendedTitle")}</h1>
        <p className="opacity-70">{t("site.suspendedDescription")}</p>
      </main>
    );
  }

  if (!data.page) notFound();
  const content = parseRenderableContent(data.page.content);
  if (!content) notFound();

  return (
    <>
      <Render config={renderConfig} data={content} metadata={await siteRenderMetadata(data.site.locale)} />
      {data.site.analytics && (
        // Cookie-less view counter (see src/server/stats/collect.ts).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/_p/v?p=${encodeURIComponent(data.page.path)}`}
          alt=""
          width={1}
          height={1}
          className="site-beacon"
          data-testid="stats-beacon"
        />
      )}
    </>
  );
}
