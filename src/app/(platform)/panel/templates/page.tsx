import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { TemplateCard } from "@/components/templates/template-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { listGallery } from "@/server/templates/client";
import { TEMPLATE_CATEGORIES } from "@/server/templates/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("templates");
  return { title: t("title") };
}

export default async function TemplatesGalleryPage({ searchParams }: PageProps<"/panel/templates">) {
  const user = await requireUser("/templates");
  const { category, purchased } = await searchParams;
  const active =
    typeof category === "string" && (TEMPLATE_CATEGORIES as readonly string[]).includes(category)
      ? category
      : undefined;
  const [templates, t, tCommon] = await Promise.all([
    listGallery(user.id, active),
    getTranslations("templates"),
    getTranslations("common"),
  ]);
  const tBilling = await getTranslations("billing");

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        ← {tCommon("dashboard")}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      {purchased === "1" && <Alert data-testid="template-purchased">{tBilling("purchased")}</Alert>}
      <nav className="flex flex-wrap gap-2" aria-label={t("title")}>
        {[undefined, ...TEMPLATE_CATEGORIES].map((c) => (
          <Link
            key={c ?? "all"}
            href={c ? `/templates?category=${c}` : "/templates"}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              c === active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {c ? t(`categories.${c}`) : t("all")}
          </Link>
        ))}
      </nav>
      {templates.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              action={
                <Button asChild size="sm">
                  <Link href={`/templates/${template.id}/use`}>{t("use")}</Link>
                </Button>
              }
            />
          ))}
        </ul>
      )}
    </main>
  );
}
