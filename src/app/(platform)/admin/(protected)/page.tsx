import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { BarChart } from "@/components/admin/bar-chart";
import { formatMoney } from "@/lib/format";
import { getDashboardMetrics } from "@/server/admin/metrics";
import { hasPermission } from "@/server/auth/permissions";
import { STAFF_ROLES } from "@/server/auth/roles";
import { requireRole } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="grid gap-1 rounded-lg border p-4" data-testid={testId}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** Admin home: headline metrics and the last 12 months (served at admin.{ROOT_DOMAIN}/). */
export default async function AdminPage() {
  const user = await requireRole(STAFF_ROLES, "/");
  const [t, locale] = await Promise.all([getTranslations("admin"), getLocale()]);
  const metrics = hasPermission(user.role, "clients.view") ? await getDashboardMetrics() : null;
  const money = (value: number) => formatMoney(value, "PLN", locale).replace(/,00(?=\s)/, "");
  const count = (value: number) => new Intl.NumberFormat(locale).format(value);
  const monthLabel = (month: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
      new Date(`${month}-01T00:00:00Z`),
    );

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="admin-title">
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("description", { email: user.email, role: user.role })}</p>
      </div>
      {metrics && (
        <>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat
              label={t("metrics.mrr")}
              value={money(metrics.mrr)}
              hint={t("metrics.gross")}
              testId="metric-mrr"
            />
            <Stat
              label={t("metrics.active")}
              value={count(metrics.activeSubscriptions)}
              hint={t("metrics.pastDue", { count: metrics.pastDue })}
            />
            <Stat
              label={t("metrics.trialing")}
              value={count(metrics.trialing)}
              hint={t("metrics.manual", { count: metrics.manual })}
            />
            <Stat
              label={t("metrics.newClients")}
              value={count(metrics.newClients30)}
              hint={t("metrics.last30")}
            />
            <Stat
              label={t("metrics.churn")}
              value={new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(
                metrics.churnRate,
              )}
              hint={t("metrics.last30")}
            />
            <Stat label={t("metrics.failed")} value={count(metrics.failed30)} hint={t("metrics.last30")} />
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <BarChart
              title={t("charts.revenue")}
              points={metrics.revenue}
              format={money}
              monthLabel={monthLabel}
              tableLabel={t("charts.table")}
              testId="chart-revenue"
            />
            <BarChart
              title={t("charts.newClients")}
              points={metrics.newClients}
              format={count}
              monthLabel={monthLabel}
              tableLabel={t("charts.table")}
            />
            <BarChart
              title={t("charts.cancellations")}
              points={metrics.cancellations}
              format={count}
              monthLabel={monthLabel}
              tableLabel={t("charts.table")}
            />
            <BarChart
              title={t("charts.failed")}
              points={metrics.failedPayments}
              format={count}
              monthLabel={monthLabel}
              tableLabel={t("charts.table")}
            />
          </div>
        </>
      )}
    </main>
  );
}
