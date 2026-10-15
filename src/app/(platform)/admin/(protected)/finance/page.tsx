import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { BarChart } from "@/components/charts/bar-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { requirePermission } from "@/server/auth/session";
import { getFinanceReport } from "@/server/finance/load";
import { REVENUE_SOURCES } from "@/server/finance/report";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminFinance");
  return { title: t("title") };
}

/** Revenue, costs and net profit (last 12 months, all sources) and the 12-month forecast (ADMIN). */
export default async function AdminFinancePage() {
  await requirePermission("finance.view", "/finance");
  const [report, t, format, locale] = await Promise.all([
    getFinanceReport(),
    getTranslations("adminFinance"),
    getFormatter(),
    getLocale(),
  ]);
  const money = (value: number) => formatMoney(value, "PLN", locale);
  const monthLabel = (key: string) =>
    format.dateTime(new Date(`${key}-15T12:00:00Z`), { month: "short", year: "2-digit" });
  const percent = (value: number) => format.number(value, { style: "percent", maximumFractionDigits: 1 });
  const margin = report.totals.net > 0 ? report.totals.profit / report.totals.net : 0;
  const yearForecast = report.forecast.reduce((s, m) => s + m.profit, 0);

  const tiles = [
    { key: "mrr", value: money(report.mrr.total), testId: "finance-mrr" },
    { key: "revenue12", value: money(report.totals.gross) },
    { key: "profit12", value: money(report.totals.profit), testId: "finance-profit" },
    { key: "margin", value: percent(margin) },
    { key: "forecastProfit", value: money(yearForecast), testId: "finance-forecast" },
    {
      key: "breakEven",
      value:
        report.breakEven === null
          ? t("breakEvenNever")
          : report.breakEven === 0
            ? t("breakEvenNow")
            : t("breakEvenIn", { months: report.breakEven }),
    },
  ] as const;

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.key}>
            <CardHeader>
              <CardDescription>{t(`tiles.${tile.key}`)}</CardDescription>
              <CardTitle className="text-2xl" data-testid={"testId" in tile ? tile.testId : undefined}>
                {tile.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-8 pt-6 lg:grid-cols-2">
          <BarChart
            title={t("charts.profit")}
            points={report.history.map((m) => ({ key: m.key, value: m.profit }))}
            format={money}
            label={monthLabel}
            labelEvery={2}
            tableLabel={t("table")}
            testId="chart-profit"
          />
          <BarChart
            title={t("charts.revenue")}
            points={report.history.map((m) => ({ key: m.key, value: m.gross }))}
            format={money}
            label={monthLabel}
            labelEvery={2}
            tableLabel={t("table")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sourcesTitle")}</CardTitle>
          <CardDescription>{t("sourcesDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="finance-sources">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2">{t("source")}</th>
                <th className="text-right">{t("revenue12")}</th>
                <th className="text-right">{t("mrrColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {REVENUE_SOURCES.map((source) => (
                <tr key={source} className="border-t">
                  <td className="py-2">{t(`sources.${source}`)}</td>
                  <td className="text-right">{money(report.bySource[source])}</td>
                  <td className="text-right">{money(report.mrr.bySource[source])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("monthsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-right text-sm" data-testid="finance-months">
            <thead className="text-muted-foreground">
              <tr>
                {(["month", "gross", "vat", "net", "fees", "registrar", "fixed", "profit"] as const).map(
                  (col) => (
                    <th key={col} className={col === "month" ? "py-2 text-left" : ""}>
                      {t(`columns.${col}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {[...report.history].reverse().map((m) => (
                <tr key={m.key} className="border-t">
                  <td className="py-2 text-left">{monthLabel(m.key)}</td>
                  <td>{money(m.gross)}</td>
                  <td>{money(m.vat)}</td>
                  <td>{money(m.net)}</td>
                  <td>{money(m.fees)}</td>
                  <td>{money(m.registrar)}</td>
                  <td>{money(m.fixed)}</td>
                  <td className={m.profit < 0 ? "text-destructive" : "font-medium"}>{money(m.profit)}</td>
                </tr>
              ))}
              <tr className="border-t font-semibold">
                <td className="py-2 text-left">{t("total")}</td>
                <td>{money(report.totals.gross)}</td>
                <td>{money(report.totals.vat)}</td>
                <td>{money(report.totals.net)}</td>
                <td>{money(report.totals.fees)}</td>
                <td>{money(report.totals.registrar)}</td>
                <td>{money(report.totals.fixed)}</td>
                <td>{money(report.totals.profit)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("forecastTitle")}</CardTitle>
          <CardDescription data-testid="finance-assumptions">
            {t("assumptions", {
              churn: percent(report.assumptions.churnRate),
              newMrr: money(report.assumptions.newMrr),
              oneTime: money(report.assumptions.oneTimeMonthly),
              fixed: money(report.assumptions.fixedMonthly),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8 lg:grid-cols-2">
          <BarChart
            title={t("charts.forecastRevenue")}
            points={report.forecast.map((m) => ({ key: m.key, value: m.revenue }))}
            format={money}
            label={monthLabel}
            labelEvery={2}
            tableLabel={t("table")}
          />
          <BarChart
            title={t("charts.forecastProfit")}
            points={report.forecast.map((m) => ({ key: m.key, value: m.profit }))}
            format={money}
            label={monthLabel}
            labelEvery={2}
            tableLabel={t("table")}
            testId="chart-forecast"
          />
        </CardContent>
      </Card>
    </main>
  );
}
