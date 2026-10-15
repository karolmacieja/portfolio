import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { AdminCheckDomainButton, RetryDomainOrderButton } from "@/components/admin/domain-admin-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DomainOrderStatus, DomainStatus, Role } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STAFF_ROLES } from "@/server/auth/roles";
import { requireRole } from "@/server/auth/session";
import { listAllDomainOrders, listAllDomains } from "@/server/domains/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminDomains");
  return { title: t("title") };
}

/** All custom domains (DNS/SSL state) and domain registrations; staff view, admins retry registrations. */
export default async function AdminDomainsPage({ searchParams }: PageProps<"/admin/domains">) {
  const user = await requireRole(STAFF_ROLES, "/domains");
  const params = await searchParams;
  const status = Object.values(DomainStatus).find((s) => s === params.status);
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const [domains, orders, t, tDomains, format, locale] = await Promise.all([
    listAllDomains({ status, q: q || undefined }),
    listAllDomainOrders({ q: q || undefined }),
    getTranslations("adminDomains"),
    getTranslations("domains"),
    getFormatter(),
    getLocale(),
  ]);
  const date = (value: Date | null) => (value ? format.dateTime(value, { dateStyle: "medium" }) : "—");
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm",
      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
    );
  const link = (next?: string) => {
    const search = new URLSearchParams();
    if (next) search.set("status", next);
    if (q) search.set("q", q);
    return search.size ? `/domains?${search}` : "/domains";
  };

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={link()} className={chip(!status)}>
          {t("all")}
        </Link>
        {(["PENDING_DNS", "PENDING_SSL", "ERROR", "DISABLED"] as const).map((s) => (
          <Link key={s} href={link(s)} className={chip(status === s)}>
            {tDomains(`status.${s}`)}
          </Link>
        ))}
        <form className="ml-auto flex gap-2" action="/domains">
          {status && <input type="hidden" name="status" value={status} />}
          <Input
            name="q"
            defaultValue={q}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-8 w-56"
          />
          <Button type="submit" size="sm" variant="outline">
            {t("searchButton")}
          </Button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm" data-testid="admin-domains">
          <thead className="bg-muted/50">
            <tr>
              {(["hostname", "site", "status", "checked", "actions"] as const).map((column) => (
                <th key={column} className="px-4 py-2 font-medium">
                  {t(`columns.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {domains.map((domain) => (
              <tr key={domain.id} className="border-t align-top">
                <td className="px-4 py-2">
                  <div className="font-medium">{domain.hostname}</div>
                  <div className="text-xs text-muted-foreground">
                    {tDomains(`type.${domain.type}`)}
                    {domain.isPrimary ? ` · ${tDomains("primary")}` : ""}
                  </div>
                </td>
                <td className="px-4 py-2">
                  {domain.site.name} <span className="text-muted-foreground">({domain.site.slug})</span>
                  <div className="text-xs text-muted-foreground">{domain.site.owner.email}</div>
                </td>
                <td className="px-4 py-2">
                  <Badge
                    variant={
                      domain.status === "ERROR"
                        ? "destructive"
                        : domain.status === "ACTIVE"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {tDomains(`status.${domain.status}`)}
                  </Badge>
                  <div className="text-xs text-muted-foreground">SSL: {domain.sslStatus ?? "—"}</div>
                  {domain.lastError && (
                    <div className="max-w-64 text-xs break-words text-destructive">{domain.lastError}</div>
                  )}
                </td>
                <td className="px-4 py-2">{date(domain.checkedAt)}</td>
                <td className="px-4 py-2">
                  {domain.providerHostnameId && <AdminCheckDomainButton domainId={domain.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-semibold">{t("ordersTitle")}</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm" data-testid="admin-domain-orders">
          <thead className="bg-muted/50">
            <tr>
              {(["domain", "client", "status", "price", "expires", "actions"] as const).map((column) => (
                <th key={column} className="px-4 py-2 font-medium">
                  {t(`orderColumns.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t align-top">
                <td className="px-4 py-2 font-medium">{order.domainName}</td>
                <td className="px-4 py-2">{order.user.email}</td>
                <td className="px-4 py-2">
                  {tDomains(`orderStatus.${order.status}`)}
                  {order.lastError && (
                    <div className="max-w-64 text-xs break-words text-destructive">{order.lastError}</div>
                  )}
                </td>
                <td className="px-4 py-2">
                  {formatMoney(order.priceAmount, order.currency, locale)}
                  {order.registrarCost !== null && (
                    <div className="text-xs text-muted-foreground">
                      {t("cost", {
                        cost: `${(order.registrarCost / 100).toFixed(2)} ${order.registrarCurrency ?? ""}`,
                      })}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2">
                  {date(order.expiresAt)}
                  {order.status === "ACTIVE" && (
                    <div className="text-xs text-muted-foreground">
                      {order.autoRenew ? tDomains("autoRenewIsOn") : tDomains("autoRenewIsOff")}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2">
                  {user.role === Role.ADMIN && order.status === DomainOrderStatus.FAILED && (
                    <RetryDomainOrderButton orderId={order.id} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
