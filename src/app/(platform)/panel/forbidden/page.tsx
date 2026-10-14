import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

export default async function ForbiddenPage() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">{t("errors.forbiddenTitle")}</h1>
      <p className="text-muted-foreground">{t("errors.forbiddenDescription")}</p>
      <Button asChild variant="outline">
        <Link href="/dashboard">{t("common.dashboard")}</Link>
      </Button>
    </main>
  );
}
