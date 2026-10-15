import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { LicensePurchaseForm } from "@/components/licenses/license-forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth/session";
import { getMembership, listLicensePlans, MIN_SEATS } from "@/server/licenses/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("licenses");
  return { title: t("buyTitle") };
}

/** Buying a group license (self-service, paid per seat). */
export default async function LicensesPage() {
  const user = await requireUser("/licenses");
  const membership = await getMembership(user.id);
  if (membership && membership.organization.status !== "PENDING_PAYMENT") redirect("/organization");
  const [plans, t, locale, account] = await Promise.all([
    listLicensePlans(),
    getTranslations("licenses"),
    getLocale(),
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { emailVerified: true, billingProfile: { select: { id: true } } },
    }),
  ]);
  const ready = Boolean(account.emailVerified && account.billingProfile);

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-6 py-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        ← {t("back")}
      </Link>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t("buyTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("buyDescription")}</p>
      </div>
      {!account.emailVerified && <Alert>{t("errors.emailNotVerified")}</Alert>}
      {!account.billingProfile && (
        <Alert className="flex flex-wrap items-center justify-between gap-2">
          <span>{t("errors.billingProfileRequired")}</span>
          <Button asChild size="sm" variant="outline">
            <Link href="/billing/profile?next=/licenses">{t("billingProfile")}</Link>
          </Button>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t("buyCardTitle")}</CardTitle>
          <CardDescription>{t("buyCardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPlans")}</p>
          ) : (
            <LicensePurchaseForm
              plans={plans.map((p) => ({
                id: p.id,
                name: p.name,
                seatPriceMonthly: p.seatPriceMonthly,
                seatPriceYearly: p.seatPriceYearly,
              }))}
              locale={locale}
              minSeats={MIN_SEATS}
              disabled={!ready}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
