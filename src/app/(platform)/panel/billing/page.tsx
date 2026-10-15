import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { CancelSubscriptionForm, PortalButton } from "@/components/billing/billing-forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubscriptionStatus } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getBillingOverview } from "@/server/billing/service";
import { listUserInvoices } from "@/server/invoicing/client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing");
  return { title: t("title") };
}

/** Subscription overview: plan and status, cancel/resume, customer portal, billing profile, payments. */
export default async function BillingPage() {
  const user = await requireUser("/billing");
  const [overview, invoices] = await Promise.all([getBillingOverview(user.id), listUserInvoices(user.id)]);
  const [t, tCommon, format, locale] = await Promise.all([
    getTranslations("billing"),
    getTranslations("common"),
    getFormatter(),
    getLocale(),
  ]);
  const date = (value: Date | null) => (value ? format.dateTime(value, { dateStyle: "medium" }) : "—");
  const { subscription, profile, payments, managedByProvider } = overview;
  const entitled = Boolean(overview.entitlements.plan);

  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-6 py-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        ← {tCommon("dashboard")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {subscription?.status === SubscriptionStatus.PAST_DUE && (
        <Alert variant="destructive" data-testid="past-due-alert">
          {t("pastDue")}
        </Alert>
      )}

      <Card data-testid="billing-subscription">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>
            {t("currentPlan")}:{" "}
            <span data-testid="billing-plan">
              {entitled ? overview.entitlements.plan?.name : t("noPlan")}
            </span>
          </CardTitle>
          <Button asChild size="sm" variant={entitled ? "outline" : "default"}>
            <Link href="/plans">{entitled ? t("changePlan") : t("choosePlan")}</Link>
          </Button>
        </CardHeader>
        {subscription && entitled && (
          <CardContent className="grid gap-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" data-testid="billing-status">
                {t(`status.${subscription.status}`)}
              </Badge>
              {subscription.price && <span>{t(`interval.${subscription.price.interval}`)}</span>}
            </div>
            <p className="text-muted-foreground">
              {subscription.cancelAtPeriodEnd
                ? t("endsAt", { date: date(subscription.currentPeriodEnd) })
                : subscription.status === SubscriptionStatus.TRIALING
                  ? t("trialEnds", { date: date(subscription.trialEndsAt) })
                  : t("renews", { date: date(subscription.currentPeriodEnd) })}
            </p>
            {managedByProvider ? (
              <div className="flex flex-wrap items-start gap-2">
                <CancelSubscriptionForm cancelAtPeriodEnd={subscription.cancelAtPeriodEnd} />
                <PortalButton />
              </div>
            ) : (
              <p className="text-muted-foreground">{t("manualSubscription")}</p>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("profile")}</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link href="/billing/profile">{t("editProfile")}</Link>
          </Button>
        </CardHeader>
        <CardContent className="text-sm" data-testid="billing-profile">
          {profile ? (
            <address className="not-italic">
              {profile.companyName && <div>{profile.companyName}</div>}
              <div>{profile.fullName}</div>
              {profile.taxId && <div>NIP: {profile.taxId}</div>}
              {profile.euVatId && <div>VAT: {profile.euVatId}</div>}
              <div>
                {profile.line1}
                {profile.line2 ? `, ${profile.line2}` : ""}
              </div>
              <div>
                {profile.postalCode} {profile.city}, {profile.country}
              </div>
              {profile.reverseCharge && (
                <p className="mt-2 text-muted-foreground">{t("profileForm.reverseCharge")}</p>
              )}
            </address>
          ) : (
            <p className="text-muted-foreground">{t("profileMissing")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("invoices")}</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noInvoices")}</p>
          ) : (
            <table className="w-full text-left text-sm" data-testid="invoices">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">{t("invoiceNumber")}</th>
                  <th className="py-2 font-normal">{t("paymentDate")}</th>
                  <th className="py-2 font-normal">{t("amount")}</th>
                  <th className="py-2 font-normal">KSeF</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t" data-testid={`invoice-${invoice.kind}`}>
                    <td className="py-2">
                      {invoice.number}
                      {invoice.correctedInvoice?.number && (
                        <div className="text-xs text-muted-foreground">
                          {t("correctionOf", { number: invoice.correctedInvoice.number })}
                        </div>
                      )}
                    </td>
                    <td className="py-2">{date(invoice.issueDate)}</td>
                    <td className="py-2">{formatMoney(invoice.grossAmount, invoice.currency, locale)}</td>
                    <td className="py-2" title={invoice.ksefNumber ?? undefined}>
                      {t(`ksefStatus.${invoice.ksefStatus}`)}
                    </td>
                    <td className="py-2 text-right">
                      <a
                        href={`/api/invoices/${invoice.id}/pdf`}
                        className="underline-offset-4 hover:underline"
                      >
                        {t("downloadPdf")}
                      </a>
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
          <CardTitle>{t("payments")}</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPayments")}</p>
          ) : (
            <table className="w-full text-left text-sm" data-testid="payments">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">{t("paymentDate")}</th>
                  <th className="py-2 font-normal">{t("paymentDescription")}</th>
                  <th className="py-2 font-normal">{t("amount")}</th>
                  <th className="py-2 font-normal">{t("paymentStatusLabel")}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-t">
                    <td className="py-2">{date(payment.paidAt ?? payment.createdAt)}</td>
                    <td className="py-2">{payment.description}</td>
                    <td className="py-2">{formatMoney(payment.amount, payment.currency, locale)}</td>
                    <td className="py-2">
                      {t(`paymentStatus.${payment.status}`)}
                      {payment.status === "PAID" && payment.refundedAmount > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {t("partiallyRefunded", {
                            amount: formatMoney(payment.refundedAmount, payment.currency, locale),
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
