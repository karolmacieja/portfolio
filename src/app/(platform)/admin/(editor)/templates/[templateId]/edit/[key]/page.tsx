import type { Data } from "@puckeditor/core";
import { notFound } from "next/navigation";

import { parseRenderableContent } from "@/blocks/content";
import { PageEditor } from "@/components/editor/site-editor";
import { platformUrl } from "@/lib/env";
import { requirePermission } from "@/server/auth/session";
import { publishTemplateFromEditorAction, saveTemplatePageAction } from "@/server/templates/actions";
import { getTemplateForAdmin } from "@/server/templates/admin";
import { TemplateError } from "@/server/templates/errors";

import "@/themes/fonts.css";
import "@/blocks/blocks.css";

/** Template mode of the editor: same Puck editor, all blocks available, lock rules editable. */
export default async function TemplateEditorPage({
  params,
}: PageProps<"/admin/templates/[templateId]/edit/[key]">) {
  const { templateId, key } = await params;
  await requirePermission("templates.manage", `/templates/${templateId}/edit/${key}`);
  let template: Awaited<ReturnType<typeof getTemplateForAdmin>>;
  try {
    template = await getTemplateForAdmin(templateId);
  } catch (error) {
    if (error instanceof TemplateError) notFound();
    throw error;
  }
  const page = template.draftData.pages.find((p) => p.key === key);
  if (!page) notFound();
  const data = (parseRenderableContent(page.content) ?? { root: { props: {} }, content: [] }) as Data;

  return (
    <PageEditor
      mode="template"
      pageKey={page.key}
      pageTitle={`${template.name} · ${page.title}`}
      pagePath={page.path}
      previewUrl={platformUrl("app", `/template-preview/${template.slug}/${page.path}`)}
      backHref={`/templates/${template.id}`}
      pages={template.draftData.pages.map((p) => ({
        key: p.key,
        title: p.title,
        path: p.path,
        href: `/templates/${template.id}/edit/${p.key}`,
      }))}
      theme={template.draftData.theme}
      initialData={data}
      initialLockRules={page.lockRules}
      lockedBlocks={[]}
      save={saveTemplatePageAction.bind(null, template.id, page.key)}
      publish={publishTemplateFromEditorAction.bind(null, template.id, page.key)}
      errorNamespace="templates.errors"
    />
  );
}
