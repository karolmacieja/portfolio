import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ReportForm } from "@/components/moderation/report-form";
import { db } from "@/lib/db";
import { customDomainUrl, siteSubdomainUrl } from "@/server/sites/urls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("report");
  return { title: t("title"), robots: { index: false } };
}

/** "Report content" (DSA notice): linked from every client site's footer, served on the platform domain. */
export default async function ReportPage({ searchParams }: PageProps<"/marketing/report">) {
  const { site: siteId } = await searchParams;
  const t = await getTranslations("report");
  const site =
    typeof siteId === "string"
      ? await db.site.findUnique({
          where: { id: siteId },
          select: {
            id: true,
            name: true,
            slug: true,
            domains: { where: { isPrimary: true, status: "ACTIVE" }, select: { hostname: true } },
          },
        })
      : null;
  return (
    <main className="mx-auto grid max-w-xl gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{site ? t("intro", { site: site.name }) : t("unknownSite")}</p>
      </div>
      {site && (
        <ReportForm
          siteId={site.id}
          defaultUrl={
            site.domains[0] ? customDomainUrl(site.domains[0].hostname) : siteSubdomainUrl(site.slug)
          }
        />
      )}
    </main>
  );
}
