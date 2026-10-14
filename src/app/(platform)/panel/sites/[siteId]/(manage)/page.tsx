import { getTranslations } from "next-intl/server";

import { AddPageForm } from "@/components/site-manager/add-page-form";
import { PageRow } from "@/components/site-manager/page-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import { getSiteWithPages } from "@/server/sites/service";

export default async function SitePagesPage({ params }: PageProps<"/panel/sites/[siteId]">) {
  const { siteId } = await params;
  const user = await requireUser();
  const site = await getSiteWithPages(user.id, siteId);
  const t = await getTranslations("pages");

  return (
    <div className="grid gap-6">
      <ul className="grid gap-3">
        {site.pages.map((page, index) => (
          <PageRow
            key={page.id}
            editHref={`/sites/${site.id}/editor/${page.id}`}
            isFirst={index === 0}
            isLast={index === site.pages.length - 1}
            page={{
              id: page.id,
              label: page.path === "" ? `${page.title} · ${t("home")}` : page.title,
              title: page.title,
              path: page.path,
              seoTitle: page.seoTitle,
              seoDescription: page.seoDescription,
              ogImageUrl: page.ogImageUrl,
              published: page.publishedAt !== null,
              hasUnpublishedChanges: page.hasUnpublishedChanges,
            }}
          />
        ))}
      </ul>
      <Card>
        <CardHeader>
          <CardTitle>{t("addTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AddPageForm siteId={site.id} />
        </CardContent>
      </Card>
    </div>
  );
}
