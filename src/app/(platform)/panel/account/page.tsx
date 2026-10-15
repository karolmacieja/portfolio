import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import {
  CancelDeletionForm,
  DeleteAccountForm,
  PasswordForm,
  ProfileForm,
} from "@/components/account/account-forms";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutEverywhereAction } from "@/server/account/actions";
import { DELETION_GRACE_DAYS } from "@/server/account/deletion";
import { getAccount } from "@/server/account/service";
import { requireUser } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("title") };
}

/** Account settings: profile, password, sessions, data export and deletion (RODO). */
export default async function AccountPage() {
  const user = await requireUser("/account");
  const [account, t, format] = await Promise.all([
    getAccount(user.id),
    getTranslations("account"),
    getFormatter(),
  ]);
  const hasPassword = Boolean(account.passwordHash);

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-6 py-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        ← {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {account.deletionScheduledAt && (
        <Alert variant="destructive" data-testid="deletion-scheduled">
          <div className="grid gap-3">
            <p>
              {t("deletionScheduled", {
                date: format.dateTime(account.deletionScheduledAt, { dateStyle: "long", timeStyle: "short" }),
              })}
            </p>
            <CancelDeletionForm />
          </div>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("profile")}</CardTitle>
          <CardDescription>
            {t("emailLine", { email: account.email })}{" "}
            {account.emailVerified ? t("emailVerified") : t("emailNotVerified")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm name={account.name ?? ""} locale={account.locale} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("password")}</CardTitle>
          {!hasPassword && <CardDescription>{t("noPassword")}</CardDescription>}
        </CardHeader>
        <CardContent>
          <PasswordForm hasPassword={hasPassword} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("billingTitle")}</CardTitle>
          <CardDescription>{t("billingDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/billing/profile">{t("billingProfile")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/billing">{t("billingOverview")}</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sessions")}</CardTitle>
          <CardDescription>{t("sessionsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signOutEverywhereAction}>
            <Button type="submit" size="sm" variant="outline">
              {t("signOutEverywhere")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("exportTitle")}</CardTitle>
          <CardDescription>{t("exportDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm" variant="outline">
            <a href="/api/account/export" download data-testid="export-link">
              {t("exportButton")}
            </a>
          </Button>
        </CardContent>
      </Card>

      {!account.deletionScheduledAt && account.role === "CLIENT" && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle>{t("deleteTitle")}</CardTitle>
            <CardDescription>{t("deleteDescription", { days: DELETION_GRACE_DAYS })}</CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteAccountForm hasPassword={hasPassword} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
