import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { CopyField, InviteForm, OrganizationForm } from "@/components/licenses/license-forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { platformUrl } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import {
  cancelSponsorRemovalAction,
  changeSeatsAction,
  leaveOrganizationAction,
  regenerateJoinCodeAction,
  removeMemberAction,
  revokeInviteAction,
  setLicenseRenewalAction,
  startSponsorRemovalAction,
} from "@/server/licenses/actions";
import { getMembership, listMembers, sponsorStatus } from "@/server/licenses/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("licenses");
  return { title: t("organizationTitle") };
}

/** The client's group license: members see their seat and the sponsor footer; the manager runs it. */
export default async function OrganizationPage({ searchParams }: PageProps<"/panel/organization">) {
  const user = await requireUser("/organization");
  const { purchased } = await searchParams;
  const [membership, t, format, locale] = await Promise.all([
    getMembership(user.id),
    getTranslations("licenses"),
    getFormatter(),
    getLocale(),
  ]);

  if (!membership) {
    return (
      <main className="mx-auto grid max-w-3xl gap-6 px-6 py-8">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← {t("back")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("organizationTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("noOrganization")}</p>
        <div>
          <Button asChild>
            <Link href="/licenses">{t("buyTitle")}</Link>
          </Button>
        </div>
      </main>
    );
  }

  const org = membership.organization;
  const manager = membership.role === "MANAGER";
  const [sponsor, team] = await Promise.all([sponsorStatus(user.id), manager ? listMembers(user.id) : null]);
  const freeSeats = org.seats - org._count.members;
  const date = (value: Date | null) => (value ? format.dateTime(value, { dateStyle: "long" }) : "—");

  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-6 py-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        ← {t("back")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="organization-name">
          {org.name}
        </h1>
        <Badge variant={membership.active ? "secondary" : "destructive"} data-testid="license-status">
          {t(`status.${org.status}`)}
        </Badge>
      </div>
      {purchased && org.status === "PENDING_PAYMENT" && <Alert>{t("pendingPayment")}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>{t("yourSeat")}</CardTitle>
          <CardDescription>
            {t("seatDescription", { plan: org.plan.name, role: t(`roles.${membership.role}`) })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {sponsor.footerOn && !sponsor.removed && (
            <div className="grid gap-2" data-testid="sponsor-offer">
              <p className="text-sm">{t("sponsorShown", { name: org.sponsorName ?? "" })}</p>
              {sponsor.settings.enabled && (
                <ActionForm
                  action={startSponsorRemovalAction}
                  hidden={{}}
                  label={t(
                    sponsor.settings.mode === "MONTHLY" ? "removeSponsorMonthly" : "removeSponsorOnce",
                    {
                      price: formatMoney(sponsor.settings.amount, "PLN", locale),
                    },
                  )}
                />
              )}
            </div>
          )}
          {sponsor.removed && (
            <div className="grid gap-2" data-testid="sponsor-removed">
              <p className="text-sm">{t("sponsorRemoved")}</p>
              {sponsor.removal?.mode === "MONTHLY" && (
                <ActionForm
                  action={cancelSponsorRemovalAction}
                  hidden={{}}
                  label={t("cancelSponsorRemoval")}
                  variant="ghost"
                />
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground">{t("upgradeHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/plans">{t("upgrade")}</Link>
            </Button>
            {!manager && (
              <ActionForm
                action={leaveOrganizationAction}
                hidden={{}}
                label={t("leave")}
                confirm={t("leaveConfirm")}
                variant="ghost"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {manager && team && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("licenseTitle")}</CardTitle>
              <CardDescription data-testid="seats-used">
                {t("seatsUsed", { used: org._count.members, total: org.seats })}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              {org.source === "STRIPE" ? (
                <>
                  <p>
                    {org.cancelAtPeriodEnd
                      ? t("endsOn", { date: date(org.currentPeriodEnd) })
                      : t("renewsOn", { date: date(org.currentPeriodEnd) })}
                    {org.seatPrice
                      ? ` · ${t(org.interval === "YEAR" ? "pricePerSeatYear" : "pricePerSeatMonth", {
                          price: formatMoney(org.seatPrice, "PLN", locale),
                        })}`
                      : ""}
                  </p>
                  {org.providerSubscriptionId && (
                    <div className="flex flex-wrap items-end gap-4">
                      <ActionForm
                        action={changeSeatsAction}
                        hidden={{}}
                        label={t("changeSeats")}
                        className="flex items-end gap-2"
                        testId="seats-form"
                      >
                        <Input
                          name="seats"
                          type="number"
                          min={Math.max(2, org._count.members)}
                          max={1000}
                          defaultValue={org.seats}
                          aria-label={t("seats")}
                          className="w-24"
                        />
                      </ActionForm>
                      <ActionForm
                        action={setLicenseRenewalAction}
                        hidden={{ cancel: org.cancelAtPeriodEnd ? "0" : "1" }}
                        label={org.cancelAtPeriodEnd ? t("resume") : t("cancel")}
                        confirm={org.cancelAtPeriodEnd ? undefined : t("cancelConfirm")}
                        variant="ghost"
                      />
                    </div>
                  )}
                </>
              ) : (
                <p>{t("manualLicense", { date: date(org.validUntil) })}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("settingsTitle")}</CardTitle>
              <CardDescription>{t("sponsorHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <OrganizationForm
                name={org.name}
                sponsorName={org.sponsorName ?? ""}
                sponsorUrl={org.sponsorUrl ?? ""}
                joinLinkEnabled={org.joinLinkEnabled}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("membersTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              {org.joinLinkEnabled && (
                <div className="grid gap-2">
                  <CopyField value={platformUrl("app", `/join?code=${org.joinCode}`)} label={t("joinLink")} />
                  <ActionForm
                    action={regenerateJoinCodeAction}
                    hidden={{}}
                    label={t("regenerate")}
                    variant="ghost"
                  />
                </div>
              )}
              <InviteForm freeSeats={freeSeats} />
              {team.invites.length > 0 && (
                <div className="grid gap-2">
                  <p className="text-sm font-medium">{t("pendingInvites")}</p>
                  <ul className="grid gap-2 text-sm" data-testid="pending-invites">
                    {team.invites.map((invite) => (
                      <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {invite.email} · {t("expires", { date: date(invite.expiresAt) })}
                        </span>
                        <ActionForm
                          action={revokeInviteAction}
                          hidden={{ id: invite.id }}
                          label={t("revoke")}
                          variant="ghost"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ul className="grid gap-2 text-sm" data-testid="members">
                {team.members.map((member) => (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-t pt-2"
                  >
                    <span>
                      {member.user.name ? `${member.user.name} · ` : ""}
                      {member.user.email}
                      {member.role === "MANAGER" && <Badge className="ml-2">{t("roles.MANAGER")}</Badge>}
                    </span>
                    {member.role !== "MANAGER" && (
                      <ActionForm
                        action={removeMemberAction}
                        hidden={{ id: member.userId }}
                        label={t("remove")}
                        confirm={t("removeConfirm", { email: member.user.email })}
                        variant="ghost"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
