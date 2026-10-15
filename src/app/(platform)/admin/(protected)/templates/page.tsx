import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { CreateTemplateForm } from "@/components/admin/template-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/server/auth/session";
import { listTemplatesWithStats } from "@/server/templates/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminTemplates");
  return { title: t("title") };
}

export default async function AdminTemplatesPage() {
  await requirePermission("templates.manage", "/templates");
  const [templates, t, format] = await Promise.all([
    listTemplatesWithStats(),
    getTranslations(),
    getFormatter(),
  ]);

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8">
      <h1 className="text-2xl font-semibold">{t("adminTemplates.title")}</h1>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" data-testid="templates-table">
          <thead className="bg-muted/50 text-left">
            <tr>
              {(["name", "status", "tier", "version", "uses", "conversion"] as const).map((column) => (
                <th key={column} className="px-4 py-2 font-medium">
                  {t(`adminTemplates.columns.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id} className="border-t">
                <td className="px-4 py-2">
                  <Link
                    href={`/templates/${template.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {template.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {template.slug} · {t(`templates.categories.${template.category as "other"}`)}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <Badge variant={template.status === "PUBLISHED" ? "secondary" : "outline"}>
                    {t(`adminTemplates.status.${template.status}`)}
                  </Badge>
                </td>
                <td className="px-4 py-2">{template.accessTier}</td>
                <td className="px-4 py-2">{template.publishedVersion?.number ?? "—"}</td>
                <td className="px-4 py-2">{template.uses}</td>
                <td className="px-4 py-2">
                  {template.conversion === null
                    ? "—"
                    : format.number(template.conversion, { style: "percent" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("adminTemplates.new")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateTemplateForm />
        </CardContent>
      </Card>
    </main>
  );
}
