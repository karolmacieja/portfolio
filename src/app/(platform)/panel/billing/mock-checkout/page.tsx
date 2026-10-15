import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { completeMockCheckoutAction } from "@/server/billing/actions";
import { MockPaymentProvider } from "@/server/payments";

/** Local stand-in for Stripe Checkout (PAYMENTS_PROVIDER=mock only). */
export default async function MockCheckoutPage({ searchParams }: PageProps<"/panel/billing/mock-checkout">) {
  if (getEnv().PAYMENTS_PROVIDER !== "mock") notFound();
  const user = await requireUser("/billing");
  const { token: rawToken } = await searchParams;
  const token = typeof rawToken === "string" ? MockPaymentProvider.readToken(rawToken) : null;
  if (!token || token.metadata.userId !== user.id) notFound();
  const [t, locale] = await Promise.all([getTranslations("billing.mock"), getLocale()]);

  let item: string;
  let amount: string;
  let trialDays = 0;
  if (token.kind === "subscription") {
    const price = await db.planPrice.findUnique({ where: { id: token.priceRef }, include: { plan: true } });
    if (!price) notFound();
    item = price.plan.name;
    amount = formatMoney(price.amount, price.currency, locale);
    trialDays = token.trialDays;
  } else {
    item = token.name;
    amount = formatMoney(token.amount, token.currency, locale);
  }

  return (
    <main className="mx-auto grid max-w-md gap-4 px-6 py-16">
      <Card data-testid="mock-checkout">
        <CardHeader>
          <CardTitle>{t("checkoutTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("checkoutHint")}</p>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <p>
            {t("item")}: <strong>{item}</strong>
          </p>
          <p>
            {t("amount")}: <strong>{amount}</strong>
          </p>
          {trialDays > 0 && <p>{t("trial", { days: trialDays })}</p>}
          {token.metadata.couponCode && <p>{t("coupon", { code: token.metadata.couponCode })}</p>}
        </CardContent>
        <CardFooter>
          <form action={completeMockCheckoutAction} className="flex w-full gap-2">
            <input type="hidden" name="token" value={rawToken as string} />
            <Button type="submit" name="decision" value="pay" className="flex-1">
              {t("pay")}
            </Button>
            <Button type="submit" name="decision" value="cancel" variant="outline">
              {t("cancel")}
            </Button>
          </form>
        </CardFooter>
      </Card>
    </main>
  );
}
