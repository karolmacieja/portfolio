import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { MockPortalActions } from "@/components/billing/billing-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnv } from "@/lib/env";
import { requireUser } from "@/server/auth/session";

/** Local stand-in for the Stripe customer portal: simulates renewals and the subscription ending. */
export default async function MockPortalPage() {
  if (getEnv().PAYMENTS_PROVIDER !== "mock") notFound();
  await requireUser("/billing");
  const t = await getTranslations("billing.mock");
  return (
    <main className="mx-auto grid max-w-md gap-4 px-6 py-16">
      <Card data-testid="mock-portal">
        <CardHeader>
          <CardTitle>{t("portalTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("checkoutHint")}</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <MockPortalActions />
          <Link href="/billing" className="text-sm hover:underline">
            ← {t("back")}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
