import { getTranslations } from "next-intl/server";

import { SiteTemplateActions } from "@/components/templates/site-template-actions";
import { TemplateCard } from "@/components/templates/template-card";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth/session";
import { getSite } from "@/server/sites/service";
import { listGallery } from "@/server/templates/client";

export default async function SiteTemplatePage({ params }: PageProps<"/panel/sites/[siteId]/template">) {
  const { siteId } = await params;
  const user = await requireUser();
  const site = await getSite(user.id, siteId);
  const [templates, current, t] = await Promise.all([
    listGallery(user.id),
    site.templateId
      ? db.template.findUnique({ where: { id: site.templateId }, select: { name: true } })
      : null,
    getTranslations("templates"),
  ]);

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground" data-testid="current-template">
        {current ? t("current", { name: current.name }) : t("noCurrent")}
      </p>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            action={
              <SiteTemplateActions siteId={site.id} templateId={template.id} templateName={template.name} />
            }
          />
        ))}
      </ul>
    </div>
  );
}
