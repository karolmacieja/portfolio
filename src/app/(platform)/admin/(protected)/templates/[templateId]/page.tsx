import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import {
  AddOverrideForm,
  AddTemplatePageForm,
  TemplateMetaForm,
  TemplatePublishControls,
} from "@/components/admin/template-forms";
import { ThemeEditor } from "@/components/site-manager/theme-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { platformUrl } from "@/lib/env";
import { requirePermission } from "@/server/auth/session";
import {
  removeTemplateOverrideAction,
  removeTemplatePageAction,
  saveTemplateThemeAction,
} from "@/server/templates/actions";
import { getTemplateForAdmin } from "@/server/templates/admin";
import { TemplateError } from "@/server/templates/errors";

import "@/themes/fonts.css";
import "@/blocks/blocks.css";

export default async function AdminTemplatePage({ params }: PageProps<"/admin/templates/[templateId]">) {
  const { templateId } = await params;
  await requirePermission("templates.manage", `/templates/${templateId}`);
  let template: Awaited<ReturnType<typeof getTemplateForAdmin>>;
  try {
    template = await getTemplateForAdmin(templateId);
  } catch (error) {
    if (error instanceof TemplateError) notFound();
    throw error;
  }
  const [plans, t, format] = await Promise.all([
    db.plan.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    getTranslations("adminTemplates"),
    getFormatter(),
  ]);

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-1">
          <Link href="/templates" className="text-sm text-muted-foreground hover:underline">
            ← {t("title")}
          </Link>
          <h1 className="flex items-center gap-3 text-2xl font-semibold" data-testid="template-title">
            {template.name}
            <Badge variant="outline">{t(`status.${template.status}`)}</Badge>
          </h1>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {template.publishedVersionId && (
            <Button asChild variant="outline">
              <a
                href={platformUrl("app", `/template-preview/${template.slug}`)}
                target="_blank"
                rel="noreferrer"
              >
                {t("preview")}
              </a>
            </Button>
          )}
          <TemplatePublishControls templateId={template.id} status={template.status} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("pages")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="divide-y rounded-lg border">
            {template.draftData.pages.map((page) => (
              <li
                key={page.key}
                className="flex items-center gap-3 px-4 py-3"
                data-testid={`template-page-${page.path || "home"}`}
              >
                <span className="mr-auto">
                  <span className="font-medium">{page.title}</span>{" "}
                  <span className="text-sm text-muted-foreground">/{page.path}</span>
                </span>
                <Button asChild size="sm">
                  <Link href={`/templates/${template.id}/edit/${page.key}`}>{t("editPage")}</Link>
                </Button>
                {page.path !== "" && (
                  <form action={removeTemplatePageAction}>
                    <input type="hidden" name="templateId" value={template.id} />
                    <input type="hidden" name="key" value={page.key} />
                    <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                      {t("removePage")}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <AddTemplatePageForm templateId={template.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("details")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TemplateMetaForm template={template} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("theme")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeEditor
            save={saveTemplateThemeAction.bind(null, template.id)}
            initialTheme={template.draftData.theme}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("overrides")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">{t("overridesHint")}</p>
          {template.overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noOverrides")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {template.overrides.map((override) => (
                <li key={override.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  {override.plan ? `${t("overridePlan")}: ${override.plan.name}` : override.user?.email}
                  <form action={removeTemplateOverrideAction}>
                    <input type="hidden" name="overrideId" value={override.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      {t("removeOverride")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <AddOverrideForm templateId={template.id} plans={plans} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("versions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1 text-sm">
            {template.versions.map((version) => (
              <li key={version.id}>
                {t("versionLabel", { number: version.number })} ·{" "}
                <span className="text-muted-foreground">
                  {format.dateTime(version.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                </span>
                {version.id === template.publishedVersionId && " ✓"}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
