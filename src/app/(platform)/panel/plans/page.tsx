import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { ChangePlanForm, CheckoutForm, ResendVerificationButton } from "@/components/billing/billing-forms";
import { PlanFeatureList } from "@/components/plans/plan-features";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { getBillingOverview } from "@/server/billing/service";
import { listActivePlans } from "@/server/plans/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("plans");
  return { title: t("title") };
}

/** Plan comparison with Checkout (no subscription) or plan switching (provider-managed subscription). */
export default async function PlansPage({ searchParams }: PageProps<"/panel/plans">) {
  const user = await requireUser("/plans");
  const { interval: intervalParam } = await searchParams;
  const interval = intervalParam === "year" ? "yearly" : "monthly";
  const [plans, overview] = await Promise.all([listActivePlans(), getBillingOverview(user.id)]);
  const t = await getTranslations();
  const locale = await getLocale();
  const { entitlements, managedByProvider, subscription } = overview;
  // A plan from a group license seat doesn't stop the member from buying a better plan for themselves.
  const entitled = entitlements.source === "subscription";
  const ready = overview.emailVerified && overview.profile;

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        ← {t("common.dashboard")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("plans.title")}</h1>
        <nav className="flex gap-1 rounded-full border p-1 text-sm" aria-label={t("billing.intervalLabel")}>
          {(["monthly", "yearly"] as const).map((option) => (
            <Link
              key={option}
              href={option === "yearly" ? "/plans?interval=year" : "/plans"}
              className={cn(
                "rounded-full px-3 py-1",
                option === interval ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
              aria-current={option === interval ? "page" : undefined}
            >
              {t(`billing.${option}`)}
              {option === "yearly" && (
                <span className="ml-1 text-xs opacity-80">({t("billing.yearlySave")})</span>
              )}
            </Link>
          ))}
        </nav>
      </div>

      {!entitled && !overview.emailVerified && (
        <Alert className="grid gap-2">
          <span>{t("billing.errors.emailNotVerified")}</span>
          <ResendVerificationButton />
        </Alert>
      )}
      {!entitled && !overview.profile && (
        <Alert className="flex flex-wrap items-center justify-between gap-2">
          <span>{t("billing.profileMissing")}</span>
          <Button asChild size="sm" variant="outline">
            <Link href="/billing/profile?next=/plans">{t("billing.editProfile")}</Link>
          </Button>
        </Alert>
      )}
      {entitled && !managedByProvider && <Alert>{t("billing.manualSubscription")}</Alert>}
      {entitlements.license && (
        <Alert data-testid="license-plan-note">
          {t("plans.licenseNote", { organization: entitlements.license.name })}
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const current = entitlements.plan?.id === plan.id;
          const price = plan[interval];
          const currentPrice = current && subscription?.priceId === price?.id;
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
                  {price && (
                    <p className="text-2xl font-semibold" data-testid="plan-price">
                      {t(interval === "yearly" ? "plans.perYear" : "plans.perMonth", {
                        price: formatMoney(price.amount, price.currency, locale),
                      })}
                    </p>
                  )}
                  {plan.trialDays > 0 && !entitled && (
                    <p className="text-sm text-muted-foreground">
                      {t("plans.trial", { days: plan.trialDays })}
                    </p>
                  )}
                </div>
                <PlanFeatureList plan={plan} />
              </CardContent>
              <CardFooter className="grid gap-2">
                {!price || currentPrice ? null : !entitled ? (
                  ready ? (
                    <CheckoutForm priceId={price.id} label={t("billing.buy")} />
                  ) : (
                    <Button disabled className="w-full">
                      {t("billing.buy")}
                    </Button>
                  )
                ) : managedByProvider ? (
                  <ChangePlanForm priceId={price.id} />
                ) : null}
              </CardFooter>
            </Card>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">{t("billing.pricesGross")}</p>
    </main>
  );
}
