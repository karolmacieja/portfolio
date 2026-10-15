import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { listClients, type ClientFilter } from "@/server/admin/clients";
import { requirePermission } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminClients");
  return { title: t("title") };
}

const STATUSES = ["subscribed", "none", "pastDue", "blocked", "staff"] as const;
const PAGE_SIZE = 50;

export default async function AdminClientsPage({ searchParams }: PageProps<"/admin/clients">) {
  await requirePermission("clients.view", "/clients");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const status = STATUSES.find((s) => s === params.status);
  const planId = typeof params.plan === "string" ? params.plan : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const filter: ClientFilter = { q: q || undefined, status, planId };
  const [{ users, total }, plans, t, format] = await Promise.all([
    listClients(filter, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    db.plan.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    getTranslations("adminClients"),
    getFormatter(),
  ]);
  const link = (next: Partial<{ status: string; plan: string; page: number }>) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    const s = "status" in next ? next.status : status;
    const p = "plan" in next ? next.plan : planId;
    if (s) search.set("status", s);
    if (p) search.set("plan", p);
    if (next.page && next.page > 1) search.set("page", String(next.page));
    return search.size ? `/clients?${search}` : "/clients";
  };
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm",
      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
    );

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={link({ status: undefined })} className={chip(!status)}>
          {t("all")}
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={link({ status: s })} className={chip(status === s)}>
            {t(`status.${s}`)}
          </Link>
        ))}
        <span className="mx-2 text-muted-foreground">|</span>
        {plans.map((plan) => (
          <Link
            key={plan.id}
            href={link({ plan: planId === plan.id ? undefined : plan.id })}
            className={chip(planId === plan.id)}
          >
            {plan.name}
          </Link>
        ))}
      </div>
      <form className="flex gap-2" action="/clients">
        {status && <input type="hidden" name="status" value={status} />}
        {planId && <input type="hidden" name="plan" value={planId} />}
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("search")}
          aria-label={t("search")}
          className="h-9 max-w-md"
        />
        <Button type="submit" size="sm" variant="outline">
          {t("searchButton")}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">{t("count", { count: total })}</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm" data-testid="admin-clients">
          <thead className="bg-muted/50">
            <tr>
              {(["client", "plan", "sites", "joined"] as const).map((column) => (
                <th key={column} className="px-4 py-2 font-medium">
                  {t(`columns.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t">
                <td className="px-4 py-2">
                  <Link href={`/clients/${user.id}`} className="font-medium hover:underline">
                    {user.email}
                  </Link>
                  <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                    {user.name}
                    {user.role !== "CLIENT" && <Badge variant="outline">{user.role}</Badge>}
                    {user.blockedAt && <Badge variant="destructive">{t("blocked")}</Badge>}
                  </div>
                </td>
                <td className="px-4 py-2">
                  {user.subscriptions[0] ? (
                    <>
                      {user.subscriptions[0].plan.name}
                      {user.subscriptions[0].status !== "ACTIVE" && (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          · {user.subscriptions[0].status}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2">{user._count.sites}</td>
                <td className="px-4 py-2">{format.dateTime(user.createdAt, { dateStyle: "medium" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 text-sm">
        {page > 1 && <Link href={link({ page: page - 1 })}>← {t("previous")}</Link>}
        {page * PAGE_SIZE < total && <Link href={link({ page: page + 1 })}>{t("next")} →</Link>}
      </div>
    </main>
  );
}
