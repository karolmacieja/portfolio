import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { CampaignFields } from "@/components/admin/campaign-fields";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { saveCampaignAction } from "@/server/newsletter/actions";
import { listCampaigns } from "@/server/newsletter/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("newsletter");
  return { title: t("title") };
}

/** Campaigns: newsletters (consent only) and service announcements (all clients). */
export default async function NewsletterPage() {
  await requirePermission("newsletter.manage", "/newsletter");
  const [campaigns, plans, organizations, consents, t, format] = await Promise.all([
    listCampaigns(),
    db.plan.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    db.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.count({ where: { role: "CLIENT", marketingConsent: true, deletedAt: null } }),
    getTranslations("newsletter"),
    getFormatter(),
  ]);
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground" data-testid="consent-count">
          {t("consents", { count: consents })}
        </p>
      </div>
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <table className="w-full text-left text-sm" data-testid="campaigns">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2">{t("fields.subject")}</th>
                  <th>{t("fields.type")}</th>
                  <th>{t("columns.status")}</th>
                  <th>{t("columns.sent")}</th>
                  <th>{t("columns.date")}</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="py-2">
                      <Link
                        href={`/newsletter/${c.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {c.subject}
                      </Link>
                    </td>
                    <td>{t(`types.${c.type}`)}</td>
                    <td>
                      <Badge variant="secondary">{t(`statuses.${c.status}`)}</Badge>
                    </td>
                    <td>
                      {c.sentCount} / {c.recipientsCount}
                    </td>
                    <td>
                      {format.dateTime(c.sentAt ?? c.scheduledAt ?? c.createdAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("newCampaign")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={saveCampaignAction}
            hidden={{}}
            label={t("createDraft")}
            variant="default"
            className="grid gap-4"
            testId="campaign-form"
          >
            <CampaignFields plans={plans} organizations={organizations} />
          </ActionForm>
        </CardContent>
      </Card>
    </main>
  );
}
