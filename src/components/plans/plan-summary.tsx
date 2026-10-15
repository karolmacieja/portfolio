import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMegabytes } from "@/lib/format";
import { getEntitlements, getUsage } from "@/server/entitlements";

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percent = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  return (
    <div className="grid gap-1">
      <span className="text-sm">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={percent >= 100 ? "h-full bg-destructive" : "h-full bg-primary"}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** Current plan, subscription status and limit usage for the dashboard. */
export async function PlanSummary({ userId }: { userId: string }) {
  const [entitlements, usage] = await Promise.all([getEntitlements(userId), getUsage(userId)]);
  const t = await getTranslations("plans");
  const locale = await getLocale();
  const format = await getFormatter();
  const date = (value: Date | null) => (value ? format.dateTime(value, { dateStyle: "medium" }) : "");
  const sub = entitlements.subscription;

  return (
    <Card data-testid="plan-summary">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>
          {t("current")}: <span data-testid="plan-name">{entitlements.plan?.name ?? t("noPlan")}</span>
        </CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link href="/plans">{t("upgrade")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!entitlements.plan && <p className="text-sm text-muted-foreground">{t("noPlanHint")}</p>}
        {entitlements.source === "license" && entitlements.license && (
          <p className="text-sm text-muted-foreground" data-testid="plan-from-license">
            {t("fromLicense", { organization: entitlements.license.name })}
          </p>
        )}
        {sub && (
          <p className="text-sm text-muted-foreground">
            {sub.cancelAtPeriodEnd
              ? t("status.cancelAtPeriodEnd", { date: date(sub.currentPeriodEnd) })
              : sub.status === "TRIALING"
                ? t("status.TRIALING", { date: date(sub.trialEndsAt) })
                : t(`status.${sub.status === "PAST_DUE" ? "PAST_DUE" : "ACTIVE"}`)}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Meter
            label={t("usage.sites", { used: usage.sites, limit: entitlements.limits.maxSites })}
            used={usage.sites}
            limit={entitlements.limits.maxSites}
          />
          <Meter
            label={t("usage.storage", {
              used: formatMegabytes(usage.storageBytes / 1024 / 1024, locale),
              limit: formatMegabytes(entitlements.limits.storageMb, locale),
            })}
            used={usage.storageBytes}
            limit={entitlements.limits.storageMb * 1024 * 1024}
          />
        </div>
      </CardContent>
    </Card>
  );
}
