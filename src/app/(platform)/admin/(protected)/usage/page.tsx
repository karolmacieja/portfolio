import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { BarChart } from "@/components/charts/bar-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/server/auth/session";
import type { MetricForecast } from "@/server/finance/capacity-forecast";
import { getUsageReport } from "@/server/finance/usage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminUsage");
  return { title: t("title") };
}

const MB = 1024 ** 2;

/** Platform usage, its 90-day history and the server scaling forecast. */
export default async function AdminUsagePage() {
  await requirePermission("clients.view", "/usage");
  const [report, t, format] = await Promise.all([
    getUsageReport(),
    getTranslations("adminUsage"),
    getFormatter(),
  ]);
  const count = (value: number) => format.number(Math.round(value));
  const bytes = (value: number) =>
    value >= 1024 * MB
      ? `${format.number(value / 1024 / MB, { maximumFractionDigits: 2 })} GB`
      : `${format.number(value / MB, { maximumFractionDigits: 1 })} MB`;
  const gb = (value: number) => `${format.number(value, { maximumFractionDigits: 2 })} GB`;
  const dayLabel = (key: string) =>
    format.dateTime(new Date(`${key}T12:00:00Z`), { day: "numeric", month: "short" });
  const when = (days: number | null) =>
    days === null
      ? t("never")
      : days === 0
        ? t("now")
        : t("inDays", {
            days,
            date: format.dateTime(new Date(report.generatedAt.getTime() + days * 86_400_000), {
              dateStyle: "medium",
            }),
          });

  const metrics: { key: "database" | "storage" | "pageViews" | "sites"; unit: (v: number) => string }[] = [
    { key: "database", unit: gb },
    { key: "storage", unit: gb },
    { key: "pageViews", unit: count },
    { key: "sites", unit: count },
  ];
  const status = (f: MetricForecast) =>
    f.capacity <= 0
      ? "untracked"
      : f.daysToWarn === 0
        ? "over"
        : f.daysToWarn !== null && f.daysToWarn <= 90
          ? "soon"
          : "ok";

  const tiles = [
    ["clients", count(report.counts.clients)],
    ["payingClients", count(report.counts.payingClients)],
    ["sites", `${count(report.counts.publishedSites)} / ${count(report.counts.sites)}`],
    ["storage", bytes(Number(report.counts.storageBytes))],
    ["database", bytes(Number(report.counts.databaseBytes))],
    ["pageViews30", count(report.counts.pageViews30)],
  ] as const;

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map(([key, value]) => (
          <Card key={key}>
            <CardHeader>
              <CardDescription>{t(`tiles.${key}`)}</CardDescription>
              <CardTitle className="text-2xl" data-testid={`usage-${key}`}>
                {value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("forecastTitle")}</CardTitle>
          <CardDescription>
            {t("forecastDescription", { percent: report.capacity.warnAtPercent })}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="capacity-forecast">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2">{t("columns.metric")}</th>
                <th>{t("columns.current")}</th>
                <th>{t("columns.capacity")}</th>
                <th>{t("columns.in90")}</th>
                <th>{t("columns.warn")}</th>
                <th>{t("columns.full")}</th>
                <th>{t("columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(({ key, unit }) => {
                const f = report.forecast[key];
                const s = status(f);
                return (
                  <tr key={key} className="border-t" data-testid={`capacity-${key}`}>
                    <td className="py-2 font-medium">{t(`metrics.${key}`)}</td>
                    <td>
                      {unit(f.current)}
                      {f.capacity > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          ({format.number(f.usage, { style: "percent" })})
                        </span>
                      )}
                    </td>
                    <td>{f.capacity > 0 ? unit(f.capacity) : "—"}</td>
                    <td>{unit(f.in90Days)}</td>
                    <td>{f.capacity > 0 ? when(f.daysToWarn) : "—"}</td>
                    <td>{f.capacity > 0 ? when(f.daysToFull) : "—"}</td>
                    <td>
                      <Badge variant={s === "over" ? "destructive" : s === "soon" ? "default" : "secondary"}>
                        {t(`status.${s}`)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">{t("advice")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-8 pt-6 lg:grid-cols-2">
          <BarChart
            title={t("charts.pageViews")}
            points={report.history.map((row) => ({ key: row.key, value: row.pageViews }))}
            format={count}
            label={dayLabel}
            labelEvery={15}
            tableLabel={t("table")}
            testId="chart-page-views"
          />
          <BarChart
            title={t("charts.clients")}
            points={report.history.map((row) => ({ key: row.key, value: row.clients }))}
            format={count}
            label={dayLabel}
            labelEvery={15}
            tableLabel={t("table")}
          />
          <BarChart
            title={t("charts.storage")}
            points={report.history.map((row) => ({ key: row.key, value: row.storageBytes }))}
            format={bytes}
            label={dayLabel}
            labelEvery={15}
            tableLabel={t("table")}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("topSites")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {report.topSites.map((site) => (
                <li key={site.id} className="flex justify-between gap-2 border-t pt-1">
                  <span>
                    {site.name} <span className="text-muted-foreground">({site.slug})</span>
                  </span>
                  <span>{count(site.views)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("topStorage")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {report.topStorage.map((row) => (
                <li key={row.userId} className="flex justify-between gap-2 border-t pt-1">
                  <Link href={`/clients/${row.userId}`} className="underline-offset-4 hover:underline">
                    {row.email}
                  </Link>
                  <span>{bytes(row.bytes)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
