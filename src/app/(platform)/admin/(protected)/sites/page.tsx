import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { moderateSiteAction } from "@/server/moderation/actions";
import { listSitesForAdmin } from "@/server/moderation/service";
import { siteSubdomainUrl } from "@/server/sites/urls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminModeration");
  return { title: t("sitesTitle") };
}

export default async function AdminSitesPage({ searchParams }: PageProps<"/admin/sites">) {
  await requirePermission("sites.moderate", "/sites");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const status = Object.values(SiteStatus).find((s) => s === params.status);
  const [sites, t] = await Promise.all([
    listSitesForAdmin({ q: q || undefined, status }),
    getTranslations("adminModeration"),
  ]);
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm",
      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
    );

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
      <h1 className="text-2xl font-semibold">{t("sitesTitle")}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={q ? `/sites?q=${encodeURIComponent(q)}` : "/sites"} className={chip(!status)}>
          {t("all")}
        </Link>
        <Link
          href={`/sites?status=SUSPENDED${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          className={chip(status === "SUSPENDED")}
        >
          {t("suspendedFilter")}
        </Link>
        <form className="ml-auto flex gap-2" action="/sites">
          {status && <input type="hidden" name="status" value={status} />}
          <Input
            name="q"
            defaultValue={q}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-8 w-64"
          />
          <Button type="submit" size="sm" variant="outline">
            {t("searchButton")}
          </Button>
        </form>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm" data-testid="admin-sites">
          <tbody>
            {sites.map((site) => (
              <tr key={site.id} className="border-t align-top" data-testid={`admin-site-${site.slug}`}>
                <td className="px-4 py-2">
                  <a
                    href={siteSubdomainUrl(site.slug)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium hover:underline"
                  >
                    {site.name}
                  </a>
                  <div className="text-xs text-muted-foreground">
                    {site.slug} ·{" "}
                    <Link href={`/clients/${site.owner.id}`} className="hover:underline">
                      {site.owner.email}
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-2">
                  {site.status === "SUSPENDED" ? (
                    <Badge variant="destructive">
                      {t(`reason.${site.suspensionReason ?? "MODERATION"}`)}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{site.publishedAt ? t("published") : t("draft")}</Badge>
                  )}
                  {site.suspensionNote && (
                    <div className="mt-1 max-w-64 text-xs text-muted-foreground">{site.suspensionNote}</div>
                  )}
                  {site._count.abuseReports > 0 && (
                    <div className="mt-1 text-xs">
                      <Link href="/reports" className="text-destructive hover:underline">
                        {t("openReports", { count: site._count.abuseReports })}
                      </Link>
                    </div>
                  )}
                </td>
                <td className="px-4 py-2">
                  {site.status === "SUSPENDED" && site.suspensionReason !== "MODERATION" ? (
                    <span className="text-xs text-muted-foreground">{t("paymentSuspension")}</span>
                  ) : (
                    <ActionForm
                      action={moderateSiteAction}
                      hidden={{ siteId: site.id, suspend: site.status === "SUSPENDED" ? "0" : "1" }}
                      label={site.status === "SUSPENDED" ? t("unsuspend") : t("suspend")}
                      variant={site.status === "SUSPENDED" ? "outline" : "destructive"}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <Input
                        name="reason"
                        required
                        minLength={5}
                        maxLength={2000}
                        placeholder={t("reason.placeholder")}
                        aria-label={t("reason.placeholder")}
                        className="h-8 w-56"
                      />
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
