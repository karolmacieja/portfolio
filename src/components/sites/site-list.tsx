import { getTranslations } from "next-intl/server";

import { PublishButton } from "@/components/sites/publish-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SiteSummary } from "@/server/sites/service";
import { siteSubdomainUrl } from "@/server/sites/urls";

export async function SiteList({ sites }: { sites: SiteSummary[] }) {
  const t = await getTranslations("sites");
  if (sites.length === 0) return <p className="text-muted-foreground">{t("empty")}</p>;

  return (
    <ul className="grid gap-4">
      {sites.map((site) => {
        const url = siteSubdomainUrl(site.slug);
        const published = site.publishedAt !== null;
        return (
          <li key={site.id}>
            <Card data-testid={`site-${site.slug}`}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{site.name}</CardTitle>
                  {site.status === "SUSPENDED" ? (
                    <Badge variant="destructive">{t("statusSuspended")}</Badge>
                  ) : published ? (
                    <Badge variant="secondary">{t("statusPublished")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("statusDraft")}</Badge>
                  )}
                  {published && site.hasUnpublishedChanges && (
                    <Badge variant="outline">{t("statusChanges")}</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                {published ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm underline underline-offset-4"
                  >
                    {url}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">{url}</span>
                )}
                <PublishButton siteId={site.id} republish={published} />
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
