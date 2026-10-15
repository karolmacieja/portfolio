import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { SignOutButton } from "@/components/sign-out-button";
import { ClientUsage } from "@/components/plans/client-usage";
import { PlanSummary } from "@/components/plans/plan-summary";
import { CreateSiteForm } from "@/components/sites/create-site-form";
import { SiteList } from "@/components/sites/site-list";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getEnv, platformUrl } from "@/lib/env";
import { isStaff } from "@/server/auth/roles";
import { isImpersonating, requireUser } from "@/server/auth/session";
import { countUnreadMessages } from "@/server/contact/service";
import { getEntitlements } from "@/server/entitlements";
import { currentTermsVersion } from "@/server/legal/service";
import { acceptTermsAction } from "@/server/account/actions";
import { listSites } from "@/server/sites/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return { title: t("dashboard") };
}

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const t = await getTranslations();
  const [{ emailVerified, termsVersion }, sites, unread, termsCurrent, entitlements] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { emailVerified: true, termsVersion: true },
    }),
    listSites(user.id),
    countUnreadMessages(user.id),
    currentTermsVersion(),
    getEntitlements(user.id),
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
            <Link href="/messages" data-testid="nav-messages">
              {unread ? t("messages.navUnread", { count: unread }) : t("messages.nav")}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/media">{t("siteNav.media")}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/billing">{t("billing.nav")}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/organization" data-testid="nav-organization">
              {t("licenses.nav")}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/account">{t("account.nav")}</Link>
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
      {termsVersion !== termsCurrent && !isImpersonating(user) && (
        <Alert className="grid gap-2" data-testid="terms-update">
          <span>
            {t.rich(termsVersion ? "onboarding.termsUpdated" : "onboarding.termsMissing", {
              terms: (chunks) => (
                <a
                  href={platformUrl(undefined, "/regulamin")}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {chunks}
                </a>
              ),
            })}
          </span>
          <ActionForm
            action={acceptTermsAction}
            hidden={{}}
            label={t("onboarding.acceptTerms")}
            variant="default"
          />
        </Alert>
      )}
      {sites.length === 0 && (
        <Card data-testid="onboarding">
          <CardHeader>
            <CardTitle>{t("onboarding.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-4">
              {[
                { key: "plan" as const, done: Boolean(entitlements.plan), href: "/plans" },
                { key: "template" as const, done: false, href: "/templates" },
                { key: "publish" as const, done: false, href: null },
              ].map((step, index) => (
                <li key={step.key} className="flex items-start gap-3">
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      step.done ? "bg-primary text-primary-foreground" : "border"
                    }`}
                  >
                    {step.done ? "✓" : index + 1}
                  </span>
                  <div className="grid gap-1">
                    <p className="font-medium">{t(`onboarding.${step.key}.title`)}</p>
                    <p className="text-sm text-muted-foreground">{t(`onboarding.${step.key}.text`)}</p>
                    {step.href && !step.done && (
                      <div>
                        <Button asChild size="sm" variant={step.key === "template" ? "default" : "outline"}>
                          <Link href={step.href}>
                            {t(`onboarding.${step.key as "plan" | "template"}.cta`)}
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <PlanSummary userId={user.id} />
      {sites.length > 0 && <ClientUsage userId={user.id} />}

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">{t("sites.title")}</h2>
        <SiteList sites={sites} />
      </section>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("sites.createTitle")}</CardTitle>
          <Button asChild size="sm">
            <Link href="/templates">{t("templates.startFromTemplate")}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <CreateSiteForm rootDomain={env.ROOT_DOMAIN} protocol={env.APP_PROTOCOL} />
        </CardContent>
      </Card>
    </main>
  );
}
