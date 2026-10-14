import { getTranslations } from "next-intl/server";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CheckEmailPage() {
  const t = await getTranslations("auth");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t("checkEmailTitle")}</CardTitle>
        <CardDescription>{t("checkEmailDescription")}</CardDescription>
      </CardHeader>
    </Card>
  );
}
