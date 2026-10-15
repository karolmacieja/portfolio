import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { CampaignFields } from "@/components/admin/campaign-fields";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import {
  cancelCampaignAction,
  saveCampaignAction,
  scheduleCampaignAction,
  sendCampaignTestAction,
} from "@/server/newsletter/actions";
import { countAudience, getCampaign, NewsletterError, previewCampaign } from "@/server/newsletter/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("newsletter");
  return { title: t("title") };
}

export default async function CampaignPage({ params }: PageProps<"/admin/newsletter/[campaignId]">) {
  const { campaignId } = await params;
  const actor = await requirePermission("newsletter.manage", `/newsletter/${campaignId}`);
  let campaign: Awaited<ReturnType<typeof getCampaign>>;
  try {
    campaign = await getCampaign(campaignId);
  } catch (error) {
    if (error instanceof NewsletterError) notFound();
    throw error;
  }
  const editable = campaign.status === "DRAFT" || campaign.status === "SCHEDULED";
  const [plans, organizations, audienceSize, preview, failed, t, format] = await Promise.all([
    db.plan.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    db.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    countAudience(campaign.audience, campaign.type),
    previewCampaign(campaign.id, actor),
    db.campaignRecipient.findMany({
      where: { campaignId, status: "FAILED" },
      take: 20,
      select: { email: true, error: true },
    }),
    getTranslations("newsletter"),
    getFormatter(),
  ]);
  const date = (value: Date | null) =>
    value ? format.dateTime(value, { dateStyle: "medium", timeStyle: "short" }) : "—";

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
      <Link href="/newsletter" className="text-sm text-muted-foreground hover:underline">
        ← {t("title")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{campaign.subject}</h1>
        <Badge data-testid="campaign-status">{t(`statuses.${campaign.status}`)}</Badge>
        <Badge variant="outline">{t(`types.${campaign.type}`)}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("statsTitle")}</CardTitle>
          <CardDescription data-testid="campaign-stats">
            {t("stats", {
              recipients: campaign.recipientsCount,
              sent: campaign.sentCount,
              failed: campaign.failedCount,
              unsubscribes: campaign.unsubscribes,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>
            {t("timeline", {
              scheduled: date(campaign.scheduledAt),
              started: date(campaign.startedAt),
              sent: date(campaign.sentAt),
            })}
          </p>
          {failed.length > 0 && (
            <ul className="grid gap-1 text-xs text-destructive">
              {failed.map((r) => (
                <li key={r.email}>
                  {r.email}: {r.error}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>{t("sendTitle")}</CardTitle>
            <CardDescription data-testid="audience-size">
              {t("audienceSize", { count: audienceSize })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            <ActionForm
              action={sendCampaignTestAction}
              hidden={{ id: campaign.id }}
              label={t("sendTest", { email: actor.email })}
              success={t("testSent")}
            />
            <ActionForm
              action={scheduleCampaignAction}
              hidden={{ id: campaign.id }}
              label={t("sendNow")}
              confirm={t("sendNowConfirm", { count: audienceSize })}
              variant="default"
              testId="send-now"
            />
            <ActionForm
              action={scheduleCampaignAction}
              hidden={{ id: campaign.id }}
              label={t("schedule")}
              className="flex items-end gap-2"
            >
              <Input name="at" type="datetime-local" required aria-label={t("schedule")} className="w-56" />
            </ActionForm>
            <ActionForm
              action={cancelCampaignAction}
              hidden={{ id: campaign.id }}
              label={t("cancel")}
              variant="ghost"
            />
          </CardContent>
        </Card>
      )}
      {campaign.status === "SENDING" && (
        <ActionForm
          action={cancelCampaignAction}
          hidden={{ id: campaign.id }}
          label={t("stop")}
          variant="destructive"
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("preview")}</CardTitle>
          <CardDescription>{preview.subject}</CardDescription>
        </CardHeader>
        <CardContent>
          <iframe
            title={t("preview")}
            srcDoc={preview.html}
            sandbox=""
            className="h-[560px] w-full rounded-md border bg-white"
          />
        </CardContent>
      </Card>

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>{t("edit")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={saveCampaignAction}
              hidden={{ id: campaign.id }}
              label={t("save")}
              success={t("saved")}
              className="grid gap-4"
            >
              <CampaignFields plans={plans} organizations={organizations} values={campaign} />
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
