import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { PlanFeatureList } from "@/components/plans/plan-features";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { platformUrl } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listActivePlans } from "@/server/plans/service";

/** Public plan cards (data from the plan catalog) with a monthly/yearly switch via `?interval=year`. */
export async function PricingTable({
  interval,
  basePath,
}: {
  interval: "monthly" | "yearly";
  basePath: string;
}) {
  const [plans, t, locale] = await Promise.all([listActivePlans(), getTranslations(), getLocale()]);
  return (
    <div className="grid gap-6">
      <nav className="flex justify-center" aria-label={t("billing.intervalLabel")}>
        <div className="flex gap-1 rounded-full border p-1 text-sm">
          {(["monthly", "yearly"] as const).map((option) => (
            <Link
              key={option}
              href={option === "yearly" ? `${basePath}?interval=year#cennik` : `${basePath}#cennik`}
              scroll={false}
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
        </div>
      </nav>
      <div className="grid gap-6 md:grid-cols-3" data-testid="pricing">
        {plans.map((plan) => {
          const price = plan[interval];
          return (
            <Card
              key={plan.id}
              data-testid={`pricing-${plan.slug}`}
              className={cn("flex flex-col", plan.isFeatured && "border-primary shadow-md")}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  {plan.isFeatured && <Badge>{t("plans.featured")}</Badge>}
                </div>
                {plan.description && <CardDescription>{plan.description}</CardDescription>}
              </CardHeader>
              <CardContent className="grid gap-4">
                <div>
                  {price && (
                    <p className="text-3xl font-semibold">
                      {t(interval === "yearly" ? "plans.perYear" : "plans.perMonth", {
                        price: formatMoney(price.amount, price.currency, locale),
                      })}
                    </p>
                  )}
                  {plan.trialDays > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t("plans.trial", { days: plan.trialDays })}
                    </p>
                  )}
                </div>
                <PlanFeatureList plan={plan} />
              </CardContent>
              <CardFooter className="mt-auto">
                <Button asChild className="w-full">
                  <a href={platformUrl("app", "/register")}>{t("marketing.pricing.cta")}</a>
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
      <p className="text-center text-sm text-muted-foreground">{t("billing.pricesGross")}</p>
    </div>
  );
}
