import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { SignOutButton } from "@/components/sign-out-button";
import { CreateSiteForm } from "@/components/sites/create-site-form";
import { SiteList } from "@/components/sites/site-list";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getEnv, platformUrl } from "@/lib/env";
import { isStaff } from "@/server/auth/roles";
import { requireUser } from "@/server/auth/session";
import { listSites } from "@/server/sites/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return { title: t("dashboard") };
}

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const t = await getTranslations();
  const [{ emailVerified }, sites] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { emailVerified: true } }),
    listSites(user.id),
  ]);
  const env = getEnv();

  return (
    <main className="mx-auto grid max-w-4xl gap-8 px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold" data-testid="dashboard-title">
          {t("dashboard.title", { name: user.name ?? user.email })}
        </h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/media">{t("siteNav.media")}</Link>
          </Button>
          {isStaff(user.role) && (
            <Button asChild variant="ghost" size="sm">
              <Link href={platformUrl("admin")}>{t("common.adminPanel")}</Link>
            </Button>
          )}
          <SignOutButton />
        </div>
      </header>
      {!emailVerified && <Alert>{t("auth.emailNotVerified")}</Alert>}

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">{t("sites.title")}</h2>
        <SiteList sites={sites} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("sites.createTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateSiteForm rootDomain={env.ROOT_DOMAIN} protocol={env.APP_PROTOCOL} />
        </CardContent>
      </Card>
    </main>
  );
}
