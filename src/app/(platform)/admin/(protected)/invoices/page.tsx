import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { InvoiceActionButton } from "@/components/admin/invoice-forms";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InvoiceStatus, KsefStatus } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { invoiceAttentionCounts, listInvoices } from "@/server/invoicing/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminInvoices");
  return { title: t("title") };
}

const STATUSES = Object.values(InvoiceStatus);
const KSEF = Object.values(KsefStatus);

/** All invoices with issuing/KSeF status; FAILED = "needs manual review". Staff may view, admins act. */
export default async function AdminInvoicesPage({ searchParams }: PageProps<"/admin/invoices">) {
  await requirePermission("invoices.manage", "/invoices");
  const params = await searchParams;
  const status = STATUSES.find((s) => s === params.status);
  const ksef = KSEF.find((s) => s === params.ksef);
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const [invoices, counts, t, tBilling, format, locale] = await Promise.all([
    listInvoices({ status, ksef, q: q || undefined }),
    invoiceAttentionCounts(),
    getTranslations("adminInvoices"),
    getTranslations("billing"),
    getFormatter(),
    getLocale(),
  ]);
  const filterLink = (next: { status?: string; ksef?: string }) => {
    const search = new URLSearchParams();
    if (next.status) search.set("status", next.status);
    if (next.ksef) search.set("ksef", next.ksef);
    if (q) search.set("q", q);
    const query = search.toString();
    return query ? `/invoices?${query}` : "/invoices";
  };
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm",
      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
    );

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="invoice-filters">
        <Link href={filterLink({})} className={chip(!status && !ksef)}>
          {t("all")}
        </Link>
        <Link href={filterLink({ status: "FAILED" })} className={chip(status === "FAILED")}>
          {t("needsReview")} ({counts.failed})
        </Link>
        <Link href={filterLink({ status: "PENDING" })} className={chip(status === "PENDING")}>
          {t("status.PENDING")}
        </Link>
        <Link href={filterLink({ ksef: "ERROR" })} className={chip(ksef === "ERROR")}>
          {t("ksefErrors")} ({counts.ksefErrors})
        </Link>
        <form className="ml-auto flex gap-2" action="/invoices">
          {status && <input type="hidden" name="status" value={status} />}
          {ksef && <input type="hidden" name="ksef" value={ksef} />}
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

      {invoices.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm" data-testid="admin-invoices">
            <thead className="bg-muted/50">
              <tr>
                {(["number", "client", "amount", "status", "ksef", "actions"] as const).map((column) => (
                  <th key={column} className="px-4 py-2 font-medium">
                    {t(`columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-t align-top"
                  data-testid={`admin-invoice-${invoice.id}`}
                >
                  <td className="px-4 py-2">
                    <div className="font-medium">{invoice.number ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {t(`kind.${invoice.kind}`)}
                      {invoice.correctedInvoice?.number ? ` · ${invoice.correctedInvoice.number}` : ""} ·{" "}
                      {format.dateTime(invoice.issueDate ?? invoice.createdAt, { dateStyle: "medium" })}
                    </div>
                  </td>
                  <td className="px-4 py-2">{invoice.user.email}</td>
                  <td className="px-4 py-2">
                    {formatMoney(invoice.grossAmount, invoice.currency, locale)}
                    <div className="text-xs text-muted-foreground">
                      VAT {invoice.vatRate}
                      {invoice.reverseCharge ? ` · ${t("reverseCharge")}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={
                        invoice.status === "FAILED"
                          ? "destructive"
                          : invoice.status === "ISSUED"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {t(`status.${invoice.status}`)}
                    </Badge>
                    {invoice.lastError && (
                      <div className="mt-1 max-w-64 text-xs break-words text-destructive">
                        {invoice.lastError}
                      </div>
                    )}
                    {invoice.attempts > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {t("attempts", { count: invoice.attempts })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {tBilling(`ksefStatus.${invoice.ksefStatus}`)}
                    {invoice.ksefNumber && (
                      <div className="text-xs break-all text-muted-foreground">{invoice.ksefNumber}</div>
                    )}
                    {invoice.ksefError && (
                      <div className="max-w-64 text-xs break-words text-destructive">{invoice.ksefError}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col items-start gap-2">
                      {invoice.status === "ISSUED" && (
                        <a
                          href={`/api/invoices/${invoice.id}/pdf`}
                          className="underline-offset-4 hover:underline"
                        >
                          PDF
                        </a>
                      )}
                      {invoice.status === "FAILED" && (
                        <InvoiceActionButton invoiceId={invoice.id} kind="retry" />
                      )}
                      {invoice.status === "ISSUED" && invoice.ksefStatus === "ERROR" && (
                        <InvoiceActionButton invoiceId={invoice.id} kind="ksef" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
