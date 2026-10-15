import { notFound } from "next/navigation";
import { Render } from "@puckeditor/core/rsc";

import { renderConfig } from "@/blocks/config";
import { parseRenderableContent } from "@/blocks/content";
import { siteRenderMetadata } from "@/server/sites/render-metadata";
import { parseTemplatePages } from "@/server/templates/schema";
import { getTemplatePreview } from "@/server/templates/public";

export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

export default async function TemplatePreviewPage({
  params,
}: PageProps<"/template-preview/[slug]/[[...path]]">) {
  const { slug, path } = await params;
  const preview = await getTemplatePreview(slug);
  if (!preview) notFound();
  const pagePath = (path ?? []).join("/");
  const page = parseTemplatePages(preview.pages).find((p) => p.path === pagePath);
  const content = page ? parseRenderableContent(page.content) : null;
  if (!content) notFound();
  return <Render config={renderConfig} data={content} metadata={await siteRenderMetadata("pl")} />;
}
