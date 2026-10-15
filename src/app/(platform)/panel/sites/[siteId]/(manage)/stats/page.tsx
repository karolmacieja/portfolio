import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { BarChart } from "@/components/charts/bar-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import { can, getEntitlements } from "@/server/entitlements";
import { getSiteStats } from "@/server/stats/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stats");
  return { title: t("title") };
}

/** Cookie-less visit statistics of one site (plan feature `analytics`). */
export default async function SiteStatsPage({ params }: PageProps<"/panel/sites/[siteId]/stats">) {
  const { siteId } = await params;
  const user = await requireUser(`/sites/${siteId}/stats`);
  const [t, format, entitlements] = await Promise.all([
    getTranslations("stats"),
    getFormatter(),
    getEntitlements(user.id),
  ]);

  if (!can(entitlements, "analytics")) {
    return (
      <Card data-testid="stats-locked">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("locked")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <Link href="/plans">{t("upgrade")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const stats = await getSiteStats(user.id, siteId);
  const count = (value: number) => format.number(value);
  const dayLabel = (day: string) =>
    format.dateTime(new Date(`${day}T12:00:00Z`), { day: "numeric", month: "short" });

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>{t("views")}</CardDescription>
            <CardTitle className="text-3xl" data-testid="stats-views">
              {count(stats.totals.views)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("visitors")}</CardDescription>
            <CardTitle className="text-3xl" data-testid="stats-visitors">
              {count(stats.totals.visitors)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Card>
        <CardContent className="grid gap-8 pt-6">
          <BarChart
            title={t("viewsChart")}
            points={stats.days.map((d) => ({ key: d.day, value: d.views }))}
            format={count}
            label={dayLabel}
            labelEvery={5}
            tableLabel={t("table")}
          />
          <BarChart
            title={t("visitorsChart")}
            points={stats.days.map((d) => ({ key: d.day, value: d.visitors }))}
            format={count}
            label={dayLabel}
            labelEvery={5}
            tableLabel={t("table")}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("topPages")}</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.topPages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <table className="w-full text-left text-sm" data-testid="stats-pages">
              <tbody>
                {stats.topPages.map((page) => (
                  <tr key={page.path} className="border-t">
                    <td className="py-2 font-mono">/{page.path}</td>
                    <td className="py-2 text-right">{count(page.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
