import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { CreateCouponForm } from "@/components/admin/coupon-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Role } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import { requireRole } from "@/server/auth/session";
import { deactivateCouponAction } from "@/server/billing/actions";
import { listCoupons } from "@/server/billing/coupons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("coupons");
  return { title: t("title") };
}

export default async function AdminCouponsPage() {
  await requireRole([Role.ADMIN], "/coupons");
  const [coupons, t, format, locale] = await Promise.all([
    listCoupons(),
    getTranslations("coupons"),
    getFormatter(),
    getLocale(),
  ]);

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t("create")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateCouponForm />
        </CardContent>
      </Card>
      {coupons.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm" data-testid="coupons-table">
            <thead className="bg-muted/50">
              <tr>
                {(["code", "name", "discount", "duration", "redeemed", "expiresAt", "status"] as const).map(
                  (column) => (
                    <th key={column} className="px-4 py-2 font-medium">
                      {t(column)}
                    </th>
                  ),
                )}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="border-t" data-testid={`coupon-${coupon.code}`}>
                  <td className="px-4 py-2 font-mono">{coupon.code}</td>
                  <td className="px-4 py-2">{coupon.name}</td>
                  <td className="px-4 py-2">
                    {coupon.percentOff !== null
                      ? `${coupon.percentOff}%`
                      : formatMoney(coupon.amountOff ?? 0, "PLN", locale)}
                  </td>
                  <td className="px-4 py-2">
                    {t(`durationOption.${coupon.duration}`)}
                    {coupon.durationInMonths ? ` (${coupon.durationInMonths})` : ""}
                  </td>
                  <td className="px-4 py-2">
                    {coupon.timesRedeemed}
                    {coupon.maxRedemptions !== null ? ` / ${coupon.maxRedemptions}` : ""}
                  </td>
                  <td className="px-4 py-2">
                    {coupon.expiresAt ? format.dateTime(coupon.expiresAt, { dateStyle: "medium" }) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={coupon.isActive ? "secondary" : "outline"}>
                      {coupon.isActive ? t("active") : t("inactive")}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {coupon.isActive && (
                      <form action={deactivateCouponAction}>
                        <input type="hidden" name="couponId" value={coupon.id} />
                        <Button type="submit" size="sm" variant="outline">
                          {t("deactivate")}
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
