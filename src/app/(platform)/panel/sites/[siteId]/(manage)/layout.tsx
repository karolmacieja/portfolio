import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { SiteTabs } from "@/components/site-manager/site-tabs";
import { PublishButton } from "@/components/sites/publish-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/session";
import { SiteError } from "@/server/sites/errors";
import { getSiteWithPages } from "@/server/sites/service";
import { siteSubdomainUrl } from "@/server/sites/urls";

export default async function SiteManageLayout({ children, params }: LayoutProps<"/panel/sites/[siteId]">) {
  const { siteId } = await params;
  const user = await requireUser(`/sites/${siteId}`);
  const t = await getTranslations("siteNav");

  let site: Awaited<ReturnType<typeof getSiteWithPages>>;
  try {
    site = await getSiteWithPages(user.id, siteId);
  } catch (error) {
    if (error instanceof SiteError) notFound();
    throw error;
  }
  const base = `/sites/${site.id}`;

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-1">
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
            ← {t("back")}
          </Link>
          <h1 className="text-2xl font-semibold" data-testid="site-title">
            {site.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/media">{t("media")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={siteSubdomainUrl(site.slug)} target="_blank" rel="noreferrer">
              {t("view")}
            </a>
          </Button>
          <PublishButton siteId={site.id} republish={site.publishedAt !== null} />
        </div>
      </div>
      {site.hasUnpublishedChanges && site.publishedAt && <Alert>{t("unpublishedChanges")}</Alert>}
      {site.status === "SUSPENDED" && site.suspensionReason === "MODERATION" && (
        <Alert variant="destructive" data-testid="moderation-notice">
          {t("moderated", { reason: site.suspensionNote ?? "—" })}
        </Alert>
      )}
      <SiteTabs
        base={base}
        tabs={[
          { href: "", label: t("pages") },
          { href: "/theme", label: t("theme") },
          { href: "/template", label: t("template") },
          { href: "/domains", label: t("domains") },
          { href: "/settings", label: t("settings") },
          { href: "/history", label: t("history") },
        ]}
      />
      {children}
    </main>
  );
}
