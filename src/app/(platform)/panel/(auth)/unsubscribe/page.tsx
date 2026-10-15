import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { unsubscribeAction } from "@/server/newsletter/unsubscribe-action";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("newsletter.unsubscribePage");
  return { title: t("title"), robots: { index: false } };
}

/** Unsubscribe from marketing e-mails (link in every newsletter; no sign-in needed). */
export default async function UnsubscribePage({ searchParams }: PageProps<"/panel/unsubscribe">) {
  const { token } = await searchParams;
  const t = await getTranslations("newsletter.unsubscribePage");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm
          action={unsubscribeAction}
          hidden={{ token: typeof token === "string" ? token : "" }}
          label={t("confirm")}
          success={t("done")}
          variant="default"
          testId="unsubscribe-form"
        />
      </CardContent>
    </Card>
  );
}
