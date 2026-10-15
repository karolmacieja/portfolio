import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/admin/action-form";
import { Badge } from "@/components/ui/badge";
import { AbuseReportStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { resolveReportAction } from "@/server/moderation/actions";
import { listReports } from "@/server/moderation/service";
import { siteSubdomainUrl } from "@/server/sites/urls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminModeration");
  return { title: t("reportsTitle") };
}

/** Content reports (DSA): open first; decisions carry a statement of reasons sent to owner and reporter. */
export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requirePermission("sites.moderate", "/reports");
  const params = await searchParams;
  const status = Object.values(AbuseReportStatus).find((s) => s === params.status) ?? AbuseReportStatus.OPEN;
  const [reports, t, format] = await Promise.all([
    listReports(status),
    getTranslations("adminModeration"),
    getFormatter(),
  ]);
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm",
      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
    );

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
      <h1 className="text-2xl font-semibold">{t("reportsTitle")}</h1>
      <div className="flex gap-2">
        {Object.values(AbuseReportStatus).map((s) => (
          <Link key={s} href={`/reports?status=${s}`} className={chip(status === s)}>
            {t(`reportStatus.${s}`)}
          </Link>
        ))}
      </div>
      {reports.length === 0 && <p className="text-muted-foreground">{t("noReports")}</p>}
      <ul className="grid gap-4" data-testid="reports">
        {reports.map((report) => (
          <li
            key={report.id}
            className="grid gap-3 rounded-lg border p-4 text-sm"
            data-testid={`report-${report.id}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t(`categories.${report.category}`)}</Badge>
              <a
                href={siteSubdomainUrl(report.site.slug)}
                target="_blank"
                rel="noreferrer"
                className="font-medium hover:underline"
              >
                {report.site.name} ({report.site.slug})
              </a>
              {report.site.status === "SUSPENDED" && <Badge variant="destructive">{t("suspended")}</Badge>}
              <span className="text-muted-foreground">
                {report.site.owner.email} ·{" "}
                {format.dateTime(report.createdAt, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
            <p className="break-all text-muted-foreground">{report.path}</p>
            <p className="whitespace-pre-wrap">{report.description}</p>
            {report.reporterEmail && (
              <p className="text-xs text-muted-foreground">
                {t("reporter", { email: report.reporterEmail })}
              </p>
            )}
            {report.status === "OPEN" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {(["suspend", "dismiss"] as const).map((decision) => (
                  <ActionForm
                    key={decision}
                    action={resolveReportAction}
                    hidden={{ reportId: report.id, decision }}
                    label={t(`decision.${decision}`)}
                    variant={decision === "suspend" ? "destructive" : "outline"}
                  >
                    <textarea
                      name="reason"
                      required
                      minLength={5}
                      maxLength={2000}
                      rows={2}
                      aria-label={t(`reasonFor.${decision}`)}
                      placeholder={t(`reasonFor.${decision}`)}
                      className="rounded-md border bg-background p-2 text-sm"
                    />
                  </ActionForm>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">{t("resolution", { reason: report.resolution ?? "—" })}</p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
