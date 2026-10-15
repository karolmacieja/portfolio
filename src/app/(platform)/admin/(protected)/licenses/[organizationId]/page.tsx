import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { LicenseFields } from "@/components/admin/license-fields";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { requirePermission } from "@/server/auth/session";
import { getOrganizationAdmin } from "@/server/licenses/admin";
import {
  addMemberAdminAction,
  removeMemberAdminAction,
  setMemberSponsorAction,
  updateLicenseAction,
} from "@/server/licenses/admin-actions";
import { LicenseError } from "@/server/licenses/errors";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminLicenses");
  return { title: t("title") };
}

const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs";

export default async function AdminLicensePage({ params }: PageProps<"/admin/licenses/[organizationId]">) {
  const { organizationId } = await params;
  await requirePermission("licenses.manage", `/licenses/${organizationId}`);
  let org: Awaited<ReturnType<typeof getOrganizationAdmin>>;
  try {
    org = await getOrganizationAdmin(organizationId);
  } catch (error) {
    if (error instanceof LicenseError) notFound();
    throw error;
  }
  const [plans, t, tStatus, format, locale] = await Promise.all([
    db.plan.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    getTranslations("adminLicenses"),
    getTranslations("licenses.status"),
    getFormatter(),
    getLocale(),
  ]);
  const manual = org.source === "MANUAL";
  const date = (value: Date | null) => (value ? format.dateTime(value, { dateStyle: "medium" }) : "—");

  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
      <Link href="/licenses" className="text-sm text-muted-foreground hover:underline">
        ← {t("title")}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="admin-license-name">
          {org.name}
        </h1>
        <Badge variant="secondary">{tStatus(org.status)}</Badge>
        <Badge variant="outline">{t(`sources.${org.source}`)}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("summary", {
          manager: org.manager?.email ?? "—",
          used: org.members.length,
          seats: org.seats,
          plan: org.plan.name,
        })}
        {org.seatPrice
          ? ` · ${formatMoney(org.seatPrice, "PLN", locale)} × ${org.seats} / ${t(`intervals.${org.interval ?? "MONTH"}`)}`
          : ""}
        {!manual && ` · ${t("periodEnd", { date: date(org.currentPeriodEnd) })}`}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>{t("edit")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={updateLicenseAction}
            hidden={{ id: org.id }}
            label={t("save")}
            success={t("saved")}
            variant="default"
            className="grid gap-4"
            testId="license-edit-form"
          >
            {!manual && <p className="text-sm text-muted-foreground">{t("selfServiceHint")}</p>}
            <LicenseFields plans={plans} values={org} lockBilling={!manual} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="sponsorFooter" defaultChecked={org.sponsorFooter} />
              {t("sponsorFooter")}
            </label>
            {manual && (
              <div className="grid gap-1">
                <label htmlFor="lic-status" className="text-sm">
                  {t("status")}
                </label>
                <select id="lic-status" name="status" defaultValue={org.status} className={selectClass}>
                  {(["ACTIVE", "EXPIRED", "CANCELED"] as const).map((status) => (
                    <option key={status} value={status}>
                      {tStatus(status)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("members")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid gap-2 text-sm" data-testid="admin-license-members">
            {org.members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t pt-2"
                data-testid={`license-member-${member.user.email}`}
              >
                <span>
                  {member.user.email}
                  {member.role === "MANAGER" && <Badge className="ml-2">{t("manager")}</Badge>}
                  {member.user.sponsorRemoval?.status === "ACTIVE" && (
                    <Badge variant="outline" className="ml-2">
                      {t("paidRemoval")}
                    </Badge>
                  )}
                </span>
                <span className="flex flex-wrap gap-2">
                  <ActionForm
                    action={setMemberSponsorAction}
                    hidden={{
                      organizationId: org.id,
                      userId: member.userId,
                      hidden: member.sponsorFooterHidden ? "0" : "1",
                    }}
                    label={member.sponsorFooterHidden ? t("showSponsor") : t("hideSponsor")}
                    variant="outline"
                  />
                  {member.role !== "MANAGER" && (
                    <ActionForm
                      action={removeMemberAdminAction}
                      hidden={{ organizationId: org.id, userId: member.userId }}
                      label={t("removeMember")}
                      confirm={t("removeConfirm")}
                      variant="ghost"
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
          <ActionForm
            action={addMemberAdminAction}
            hidden={{ organizationId: org.id }}
            label={t("addMember")}
            success={t("saved")}
            className="flex flex-wrap items-end gap-2"
          >
            <Input
              name="email"
              type="email"
              required
              placeholder="email@example.com"
              aria-label={t("addMember")}
              className="w-64"
            />
          </ActionForm>
          {org.invites.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("pendingInvites", { emails: org.invites.map((i) => i.email).join(", ") })}
            </p>
          )}
        </CardContent>
      </Card>

      {org.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("payments")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {org.payments.map((payment) => (
                <li key={payment.id} className="flex justify-between gap-2 border-t pt-1">
                  <span>
                    {date(payment.createdAt)} · {payment.description}
                  </span>
                  <span>
                    {formatMoney(payment.amount, payment.currency, locale)} · {payment.status}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
