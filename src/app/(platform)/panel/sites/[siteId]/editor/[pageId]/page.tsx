import type { Data } from "@puckeditor/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { parseRenderableContent } from "@/blocks/content";
import { PageEditor } from "@/components/editor/site-editor";
import { requireUser } from "@/server/auth/session";
import { publishFromEditorAction, savePageDraftAction } from "@/server/sites/actions";
import { getBlockTiers, getEntitlements, lockedBlocks } from "@/server/entitlements";
import { SiteError } from "@/server/sites/errors";
import { getPageForEditing } from "@/server/sites/service";
import { siteSubdomainUrl } from "@/server/sites/urls";

import "@/themes/fonts.css";
import "@/blocks/blocks.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("editor");
  return { title: t("page") };
}

export default async function EditorPage({ params }: PageProps<"/panel/sites/[siteId]/editor/[pageId]">) {
  const { siteId, pageId } = await params;
  const user = await requireUser(`/sites/${siteId}/editor/${pageId}`);

  let editing: Awaited<ReturnType<typeof getPageForEditing>>;
  try {
    editing = await getPageForEditing(user.id, pageId);
  } catch (error) {
    if (error instanceof SiteError) notFound();
    throw error;
  }
  if (editing.site.id !== siteId) notFound();

  const [entitlements, tiers] = await Promise.all([getEntitlements(user.id), getBlockTiers()]);
  const data = (parseRenderableContent(editing.page.draftContent) ?? {
    root: { props: {} },
    content: [],
  }) as Data;

  return (
    <PageEditor
      mode="site"
      pageKey={editing.page.id}
      pageTitle={editing.page.title}
      pagePath={editing.page.path}
      previewUrl={siteSubdomainUrl(editing.site.slug, `/${editing.page.path}`)}
      backHref={`/sites/${siteId}`}
      pages={editing.pages.map((p) => ({
        key: p.id,
        title: p.title,
        path: p.path,
        href: `/sites/${siteId}/editor/${p.id}`,
      }))}
      theme={editing.theme}
      initialData={data}
      initialLockRules={editing.lockRules}
      lockedBlocks={lockedBlocks(entitlements, tiers)}
      save={savePageDraftAction.bind(null, editing.page.id)}
      publish={publishFromEditorAction.bind(null, editing.page.id)}
      errorNamespace="sites.errors"
    />
  );
}
