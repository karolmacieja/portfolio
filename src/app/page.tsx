import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getEnv } from "@/lib/env";

// Placeholder landing page; the marketing site is built in Phase 9.
export default async function HomePage() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">{getEnv().BRAND_NAME}</p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t("home.title")}</h1>
      <p className="text-lg text-muted-foreground">{t("home.subtitle")}</p>
      <div className="flex gap-3">
        <Button asChild size="lg">
          <Link href="/register">{t("home.cta")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">{t("common.signIn")}</Link>
        </Button>
      </div>
    </main>
  );
}
