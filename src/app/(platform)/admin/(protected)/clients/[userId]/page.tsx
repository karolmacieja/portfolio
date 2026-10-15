import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import {
  addClientNoteAction,
  grantPlanAction,
  refundPaymentAction,
  revokeManualPlanAction,
  setClientBlockedAction,
} from "@/server/admin/actions";
import { AdminError, getClientDetail } from "@/server/admin/clients";
import { startImpersonationAction } from "@/server/admin/impersonation-actions";
import { hasPermission } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/session";
import { getClientUsage } from "@/server/finance/usage";
import { ENTITLED_STATUSES } from "@/server/entitlements";
import { siteSubdomainUrl } from "@/server/sites/urls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminClients");
  return { title: t("detailTitle") };
}

/** Everything about one client for staff: plan, payments (refunds), invoices, sites, domains, notes. */
export default async function AdminClientPage({ params }: PageProps<"/admin/clients/[userId]">) {
  const { userId } = await params;
  const actor = await requirePermission("clients.view", `/clients/${userId}`);
  let client: Awaited<ReturnType<typeof getClientDetail>>;
  try {
    client = await getClientDetail(userId);
  } catch (error) {
    if (error instanceof AdminError) notFound();
    throw error;
  }
  const [plans, t, tBilling, format, locale, usage] = await Promise.all([
    db.plan.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    getTranslations("adminClients"),
    getTranslations("billing"),
    getFormatter(),
    getLocale(),
    getClientUsage(client.id),
  ]);
  const can = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(actor.role, permission);
  const date = (value: Date | null) => (value ? format.dateTime(value, { dateStyle: "medium" }) : "—");
  const current = client.subscriptions.find((s) =>
    (ENTITLED_STATUSES as readonly string[]).includes(s.status),
  );
  const manual = current && !current.providerSubscriptionId;
  const isClient = client.role === "CLIENT";

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
      <Link href="/clients" className="text-sm text-muted-foreground hover:underline">
        ← {t("title")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="client-email">
            {client.email}
          </h1>
          <p className="text-sm text-muted-foreground">
            {client.name} · {client.role} · {t("joined", { date: date(client.createdAt) })}
            {client.emailVerified ? "" : ` · ${t("unverified")}`}
          </p>
          <p className="text-sm text-muted-foreground" data-testid="client-usage">
            {t("usage", {
              views: format.number(usage.views30),
              storage: format.number(usage.storageBytes / 1024 ** 2, { maximumFractionDigits: 1 }),
              published: usage.published,
              sites: usage.sites,
              messages: usage.messages30,
            })}
          </p>
          {client.blockedAt && (
            <Badge variant="destructive" className="mt-2">
              {t("blockedSince", { date: date(client.blockedAt) })}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {isClient && !client.blockedAt && can("clients.impersonate") && (
            <ActionForm
              action={startImpersonationAction}
              hidden={{ userId: client.id }}
              label={t("impersonate")}
              className="flex flex-wrap items-end gap-2"
              testId="impersonate-form"
            >
              <Input
                name="reason"
                required
                maxLength={300}
                placeholder={t("impersonateReason")}
                aria-label={t("impersonateReason")}
                className="h-8 w-64"
              />
            </ActionForm>
          )}
          {can("clients.manage") && actor.id !== client.id && (isClient || can("staff.manage")) && (
            <ActionForm
              action={setClientBlockedAction}
              hidden={{ userId: client.id, blocked: client.blockedAt ? "0" : "1" }}
              label={client.blockedAt ? t("unblock") : t("block")}
              variant={client.blockedAt ? "outline" : "destructive"}
              confirm={client.blockedAt ? undefined : t("blockConfirm")}
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("plan")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <p data-testid="client-plan">
              {current ? (
                <>
                  <strong>{current.plan.name}</strong> · {tBilling(`status.${current.status}`)}
                  {manual ? ` · ${t("manual")}` : ` · ${t("providerManaged")}`}
                  {current.currentPeriodEnd && ` · ${t("until", { date: date(current.currentPeriodEnd) })}`}
                </>
              ) : (
                t("noPlan")
              )}
            </p>
            {can("plans.grant") && !(current && !manual) && (
              <ActionForm
                action={grantPlanAction}
                hidden={{ userId: client.id }}
                label={t("grantPlan")}
                testId="grant-plan-form"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <Label htmlFor="grant-plan">{t("plan")}</Label>
                    <select
                      id="grant-plan"
                      name="planId"
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                    >
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="grant-until">{t("grantUntil")}</Label>
                    <Input id="grant-until" name="until" type="date" />
                  </div>
                </div>
              </ActionForm>
            )}
            {can("plans.grant") && manual && (
              <ActionForm
                action={revokeManualPlanAction}
                hidden={{ userId: client.id }}
                label={t("revokePlan")}
                variant="ghost"
                confirm={t("revokeConfirm")}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("notes")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {can("clients.manage") && (
              <ActionForm
                action={addClientNoteAction}
                hidden={{ userId: client.id }}
                label={t("addNote")}
                testId="note-form"
              >
                <textarea
                  name="body"
                  required
                  maxLength={2000}
                  rows={3}
                  aria-label={t("notes")}
                  className="w-full rounded-md border bg-background p-2 text-sm"
                />
              </ActionForm>
            )}
            <ul className="grid gap-2" data-testid="client-notes">
              {client.clientNotes.map((note) => (
                <li key={note.id} className="rounded-md border p-2">
                  <p className="whitespace-pre-wrap">{note.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {note.author?.email ?? "—"} · {date(note.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("sitesAndDomains")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {client.sites.length === 0 && <p className="text-muted-foreground">—</p>}
          {client.sites.map((site) => (
            <div key={site.id} className="flex flex-wrap items-center gap-2">
              <a
                href={siteSubdomainUrl(site.slug)}
                target="_blank"
                rel="noreferrer"
                className="font-medium hover:underline"
              >
                {site.name} ({site.slug})
              </a>
              <Badge variant={site.status === "SUSPENDED" ? "destructive" : "outline"}>
                {site.status === "SUSPENDED"
                  ? `${site.status} · ${site.suspensionReason}`
                  : site.publishedAt
                    ? t("published")
                    : t("unpublished")}
              </Badge>
              {site.domains.map((domain) => (
                <Badge key={domain.id} variant="secondary">
                  {domain.hostname} · {domain.status}
                </Badge>
              ))}
            </div>
          ))}
          {client.domainOrders.map((order) => (
            <p key={order.id} className="text-muted-foreground">
              {t("domainOrder", {
                domain: order.domainName,
                status: order.status,
                date: date(order.expiresAt),
              })}
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("payments")}</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm" data-testid="client-payments">
            <tbody>
              {client.payments.map((payment) => {
                const remaining = payment.amount - payment.refundedAmount;
                return (
                  <tr key={payment.id} className="border-t align-top">
                    <td className="py-2 pr-3">{date(payment.paidAt ?? payment.createdAt)}</td>
                    <td className="py-2 pr-3">{payment.description}</td>
                    <td className="py-2 pr-3">
                      {formatMoney(payment.amount, payment.currency, locale)}
                      {payment.refundedAmount > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {t("refunded", {
                            amount: formatMoney(payment.refundedAmount, payment.currency, locale),
                          })}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3">{tBilling(`paymentStatus.${payment.status}`)}</td>
                    <td className="py-2">
                      {can("payments.refund") &&
                        payment.status === "PAID" &&
                        payment.providerChargeRef &&
                        remaining > 0 && (
                          <ActionForm
                            action={refundPaymentAction}
                            hidden={{ paymentId: payment.id }}
                            label={t("refund")}
                            confirm={t("refundConfirm")}
                            success={t("refundRequested")}
                            className="flex flex-wrap items-end gap-2"
                            testId={`refund-${payment.id}`}
                          >
                            <Input
                              name="amount"
                              inputMode="decimal"
                              placeholder={(remaining / 100).toFixed(2)}
                              aria-label={t("refundAmount")}
                              className="h-8 w-24"
                            />
                          </ActionForm>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("invoices")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          {client.invoices.map((invoice) => (
            <div key={invoice.id} className="flex flex-wrap gap-3">
              <span>{invoice.number ?? "—"}</span>
              <span>{formatMoney(invoice.grossAmount, invoice.currency, locale)}</span>
              <span className="text-muted-foreground">{invoice.status}</span>
              {invoice.status === "ISSUED" && (
                <a href={`/api/invoices/${invoice.id}/pdf`} className="hover:underline">
                  PDF
                </a>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {client.impersonations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("impersonations")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {client.impersonations.map((session) => (
              <p key={session.id}>
                {date(session.createdAt)} · {session.admin.email} · {session.reason}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
