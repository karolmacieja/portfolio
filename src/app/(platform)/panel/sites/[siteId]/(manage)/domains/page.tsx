import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import {
  AddDomainForm,
  AuthCodeButton,
  AutoRenewToggle,
  ClearPrimaryButton,
  DomainActionButton,
  DomainSearch,
} from "@/components/domains/domain-forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { isApexDomain } from "@/lib/domain-name";
import { formatMoney } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import type { DnsRecord } from "@/server/domains/providers";
import { listDomainOrders } from "@/server/domains/purchase";
import { listSiteDomains } from "@/server/domains/service";
import { can, getEntitlements } from "@/server/entitlements";
import { getSite } from "@/server/sites/service";
import { customDomainUrl, siteSubdomainHostname } from "@/server/sites/urls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("domains");
  return { title: t("title") };
}

const STATUS_VARIANT = { ACTIVE: "secondary", ERROR: "destructive" } as const;

function DnsTable({ records }: { records: DnsRecord[] }) {
  return (
    <table className="w-full text-left font-mono text-xs" data-testid="dns-records">
      <tbody>
        {records.map((record) => (
          <tr key={`${record.type}-${record.name}-${record.value}`} className="border-t align-top">
            <td className="py-1 pr-3">{record.type}</td>
            <td className="py-1 pr-3 break-all">{record.name}</td>
            <td className="py-1 break-all">{record.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Custom domains of a site: connect, DNS instructions and status, main address; buying domains. */
export default async function SiteDomainsPage({
  params,
  searchParams,
}: PageProps<"/panel/sites/[siteId]/domains">) {
  const { siteId } = await params;
  const { purchased } = await searchParams;
  const user = await requireUser(`/sites/${siteId}/domains`);
  const site = await getSite(user.id, siteId);
  const [domains, orders, entitlements, profile, account, t, format, locale] = await Promise.all([
    listSiteDomains(user.id, siteId),
    listDomainOrders(user.id, siteId),
    getEntitlements(user.id),
    db.billingProfile.findUnique({ where: { userId: user.id } }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, name: true } }),
    getTranslations("domains"),
    getFormatter(),
    getLocale(),
  ]);
  const canConnect = can(entitlements, "customDomain");
  const canBuy = can(entitlements, "domainPurchase");
  const primary = domains.find((d) => d.isPrimary && d.status === "ACTIVE");
  const [firstName = "", ...lastNames] = (profile?.fullName ?? account.name ?? "").split(" ");
  const date = (value: Date | null) => (value ? format.dateTime(value, { dateStyle: "medium" }) : "—");

  return (
    <div className="grid gap-6">
      {purchased === "1" && <Alert data-testid="domain-purchased">{t("purchasedNotice")}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription data-testid="main-address">
            {t("mainAddress", { address: primary ? primary.hostname : siteSubdomainHostname(site.slug) })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {!canConnect ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{t("featureRequired")}</span>
              <Button asChild size="sm" variant="secondary">
                <Link href="/plans">{t("upgrade")}</Link>
              </Button>
            </div>
          ) : (
            <AddDomainForm siteId={site.id} />
          )}

          {domains.length > 0 && (
            <ul className="grid gap-4" data-testid="domains">
              {domains.map((domain) => (
                <li
                  key={domain.id}
                  className="grid gap-3 rounded-lg border p-4"
                  data-testid={`domain-${domain.hostname}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {domain.status === "ACTIVE" ? (
                        <a
                          href={customDomainUrl(domain.hostname)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium hover:underline"
                        >
                          {domain.hostname}
                        </a>
                      ) : (
                        <span className="font-medium">{domain.hostname}</span>
                      )}
                      <Badge
                        variant={STATUS_VARIANT[domain.status as keyof typeof STATUS_VARIANT] ?? "outline"}
                        data-testid="domain-status"
                      >
                        {t(`status.${domain.status}`)}
                      </Badge>
                      {domain.isPrimary && <Badge>{t("primary")}</Badge>}
                      {domain.type === "PURCHASED" && <Badge variant="outline">{t("purchasedBadge")}</Badge>}
                    </div>
                    <div className="flex flex-wrap items-start gap-2">
                      {domain.status !== "DISABLED" && domain.status !== "ACTIVE" && (
                        <DomainActionButton domainId={domain.id} kind="check" />
                      )}
                      {!domain.isPrimary && domain.status !== "DISABLED" && (
                        <DomainActionButton domainId={domain.id} kind="primary" />
                      )}
                      {domain.status === "DISABLED" && canConnect && (
                        <DomainActionButton domainId={domain.id} kind="reenable" />
                      )}
                      <DomainActionButton domainId={domain.id} kind="remove" />
                    </div>
                  </div>
                  {domain.status !== "ACTIVE" && domain.status !== "DISABLED" && (
                    <div className="grid gap-2 text-sm">
                      <p>{t("dnsIntro")}</p>
                      <DnsTable
                        records={((domain.dnsRecords as DnsRecord[] | null) ?? []).filter(
                          (r) => r.purpose === "routing",
                        )}
                      />
                      {((domain.dnsRecords as DnsRecord[] | null) ?? []).some(
                        (r) => r.purpose !== "routing",
                      ) && (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground">
                            {t("dnsOptional")}
                          </summary>
                          <DnsTable
                            records={((domain.dnsRecords as DnsRecord[]) ?? []).filter(
                              (r) => r.purpose !== "routing",
                            )}
                          />
                        </details>
                      )}
                      {isApexDomain(domain.hostname) &&
                        ((domain.dnsRecords as DnsRecord[] | null) ?? []).some((r) => r.type === "CNAME") && (
                          <p className="text-xs text-muted-foreground">{t("dnsApexHint")}</p>
                        )}
                    </div>
                  )}
                  {domain.entitlementLostAt && domain.status !== "DISABLED" && (
                    <p className="text-sm text-destructive">{t("willBeDisabled")}</p>
                  )}
                  {domain.lastError && domain.status === "ERROR" && (
                    <p className="text-sm text-destructive">{domain.lastError}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {primary && <ClearPrimaryButton siteId={site.id} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("buyTitle")}</CardTitle>
          <CardDescription>{t("buyDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {canBuy ? (
            <DomainSearch
              siteId={site.id}
              defaults={{
                type: profile?.type ?? "PERSON",
                firstName,
                lastName: lastNames.join(" "),
                companyName: profile?.companyName ?? "",
                taxId: profile?.taxId ?? profile?.euVatId ?? "",
                email: account.email,
                street: [profile?.line1, profile?.line2].filter(Boolean).join(", "),
                postalCode: profile?.postalCode ?? "",
                city: profile?.city ?? "",
                country: profile?.country ?? "PL",
              }}
            />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{t("purchaseNotAllowed")}</span>
              <Button asChild size="sm" variant="secondary">
                <Link href="/plans">{t("upgrade")}</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {orders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("ordersTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3" data-testid="domain-orders">
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                  data-testid={`order-${order.domainName}`}
                >
                  <div className="grid gap-1">
                    <span className="font-medium">{order.domainName}</span>
                    <span className="text-muted-foreground">
                      {t(`orderStatus.${order.status}`)} ·{" "}
                      {t("perYear", { price: formatMoney(order.priceAmount, order.currency, locale) })}
                      {order.expiresAt && ` · ${t("expires", { date: date(order.expiresAt) })}`}
                      {order.status === "ACTIVE" &&
                        ` · ${order.autoRenew ? t("autoRenewIsOn") : t("autoRenewIsOff")}`}
                    </span>
                  </div>
                  {order.status === "ACTIVE" && (
                    <div className="flex flex-wrap items-start gap-2">
                      {order.providerSubscriptionId && (
                        <AutoRenewToggle orderId={order.id} autoRenew={order.autoRenew} />
                      )}
                      <AuthCodeButton orderId={order.id} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
