import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMegabytes, formatMoney } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getEntitlements, PLAN_FEATURES } from "@/server/entitlements";
import { listActivePlans } from "@/server/plans/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("plans");
  return { title: t("title") };
}

/** Plan comparison. Checkout (Stripe) arrives in Phase 5; until then plans can't be bought here. */
export default async function PlansPage() {
  const user = await requireUser("/plans");
  const [plans, entitlements] = await Promise.all([listActivePlans(), getEntitlements(user.id)]);
  const t = await getTranslations();
  const locale = await getLocale();

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        ← {t("common.dashboard")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("plans.title")}</h1>
      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const current = entitlements.plan?.id === plan.id;
          return (
            <Card key={plan.id} data-testid={`plan-${plan.slug}`} className={current ? "border-primary" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  {current && <Badge>{t("plans.currentBadge")}</Badge>}
                </div>
                {plan.description && <CardDescription>{plan.description}</CardDescription>}
              </CardHeader>
              <CardContent className="grid gap-4">
                <div>
                  {plan.monthly && (
                    <p className="text-2xl font-semibold">
                      {t("plans.perMonth", {
                        price: formatMoney(plan.monthly.amount, plan.monthly.currency, locale),
                      })}
                    </p>
                  )}
                  {plan.yearly && (
                    <p className="text-sm text-muted-foreground">
                      {t("plans.perYear", {
                        price: formatMoney(plan.yearly.amount, plan.yearly.currency, locale),
                      })}
                    </p>
                  )}
                  {plan.trialDays > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t("plans.trial", { days: plan.trialDays })}
                    </p>
                  )}
                </div>
                <ul className="grid gap-1 text-sm">
                  <li>{t("plans.limits.maxSites", { count: plan.maxSites })}</li>
                  <li>{t("plans.limits.maxPagesPerSite", { count: plan.maxPagesPerSite })}</li>
                  <li>
                    {plan.maxProjects === null
                      ? t("plans.limits.maxProjectsUnlimited")
                      : t("plans.limits.maxProjects", { count: plan.maxProjects })}
                  </li>
                  <li>{t("plans.limits.storageMb", { size: formatMegabytes(plan.storageMb, locale) })}</li>
                  {plan.accessTiers.map((tier) => (
                    <li key={tier}>{t(`plans.tiers.${tier}`)}</li>
                  ))}
                  {PLAN_FEATURES.filter((feature) => plan.features[feature]).map((feature) => (
                    <li key={feature}>✓ {t(`plans.features.${feature}`)}</li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="grid gap-2">
                <Button disabled={current} className="w-full" title={t("plans.comingSoon")}>
                  {t("plans.choose")}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">{t("plans.comingSoon")}</p>
    </main>
  );
}
