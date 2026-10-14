import { getFormatter, getTranslations } from "next-intl/server";

import { RestoreButton } from "@/components/site-manager/restore-button";
import { RestoreBackupButton } from "@/components/templates/site-template-actions";
import { listBackups } from "@/server/templates/client";
import { requireUser } from "@/server/auth/session";
import { listVersions, MAX_VERSIONS_PER_PAGE } from "@/server/sites/service";

export default async function SiteHistoryPage({ params }: PageProps<"/panel/sites/[siteId]/history">) {
  const { siteId } = await params;
  const user = await requireUser();
  const [pages, backups] = await Promise.all([listVersions(user.id, siteId), listBackups(user.id, siteId)]);
  const t = await getTranslations("history");
  const tTemplates = await getTranslations("templates");
  const format = await getFormatter();

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">{t("description", { count: MAX_VERSIONS_PER_PAGE })}</p>
      {pages.map((page) => (
        <section key={page.id} className="grid gap-2">
          <h2 className="font-semibold">
            {page.title} <span className="text-sm font-normal text-muted-foreground">/{page.path}</span>
          </h2>
          {page.versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {page.versions.map((version) => (
                <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="font-medium">{t("version", { number: version.number })}</span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      {format.dateTime(version.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </span>
                  <RestoreButton versionId={version.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <section className="grid gap-2" data-testid="backups">
        <h2 className="font-semibold">{tTemplates("backups")}</h2>
        {backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tTemplates("backupsEmpty")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {backups.map((backup) => (
              <li key={backup.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="font-medium">
                    {tTemplates(`backupReason.${backup.reason as "templateSwitch"}`)}
                  </span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    {format.dateTime(backup.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </span>
                <RestoreBackupButton backupId={backup.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
