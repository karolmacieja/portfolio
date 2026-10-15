import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { LegalText } from "@/components/legal/legal-text";
import { fillLegalPlaceholders, getLegalDocument } from "@/server/legal/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.legal");
  return { title: t("privacy") };
}

export default async function PrivacyPage() {
  const [document, t, format] = await Promise.all([
    getLegalDocument("privacy"),
    getTranslations("marketing.legal"),
    getFormatter(),
  ]);
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-6 py-16">
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">{t("privacy")}</h1>
        {document.updatedAt && (
          <p className="text-sm text-muted-foreground">
            {t("updated", { date: format.dateTime(new Date(document.updatedAt), { dateStyle: "long" }) })}
          </p>
        )}
      </div>
      <LegalText content={await fillLegalPlaceholders(document.content)} />
    </main>
  );
}
