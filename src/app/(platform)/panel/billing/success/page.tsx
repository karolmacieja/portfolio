import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/session";
import { getEntitlements } from "@/server/entitlements";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing");
  return { title: t("successTitle") };
}

/** Checkout return page. The webhook may arrive after the redirect, hence the pending state. */
export default async function BillingSuccessPage() {
  const user = await requireUser("/billing");
  const [entitlements, t] = await Promise.all([getEntitlements(user.id), getTranslations("billing")]);
  const plan = entitlements.plan;

  return (
    <main className="mx-auto grid max-w-xl gap-4 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">{t("successTitle")}</h1>
      <p>{t("successText")}</p>
      <p className="text-muted-foreground" data-testid="billing-success-status">
        {plan ? t("successActive", { plan: plan.name }) : t("successPending")}
      </p>
      <div className="flex justify-center gap-2">
        {!plan && (
          <Button asChild variant="outline">
            <Link href="/billing/success">{t("refresh")}</Link>
          </Button>
        )}
        <Button asChild>
          <Link href="/dashboard">{t("goToDashboard")}</Link>
        </Button>
      </div>
    </main>
  );
}
