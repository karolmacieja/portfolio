import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { UseTemplateForm } from "@/components/templates/use-template-form";
import { getEnv } from "@/lib/env";
import { requireUser } from "@/server/auth/session";
import { listGallery } from "@/server/templates/client";

export default async function UseTemplatePage({ params }: PageProps<"/panel/templates/[templateId]/use">) {
  const { templateId } = await params;
  const user = await requireUser(`/templates/${templateId}/use`);
  const template = (await listGallery(user.id)).find((t) => t.id === templateId);
  if (!template) notFound();
  const t = await getTranslations("templates");
  const env = getEnv();

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-6 py-8">
      <Link href="/templates" className="text-sm text-muted-foreground hover:underline">
        ← {t("title")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("useTitle", { name: template.name })}</h1>
      {template.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnail from our storage
        <img
          src={template.thumbnailUrl}
          alt={template.name}
          className="max-h-72 w-full rounded-xl border object-cover object-top"
        />
      )}
      {template.canUse ? (
        <UseTemplateForm templateId={template.id} rootDomain={env.ROOT_DOMAIN} protocol={env.APP_PROTOCOL} />
      ) : (
        <p className="text-muted-foreground">
          {t("locked")}{" "}
          <Link href="/plans" className="underline">
            {t("upgrade")}
          </Link>
        </p>
      )}
    </main>
  );
}
