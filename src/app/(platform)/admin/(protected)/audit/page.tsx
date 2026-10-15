import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAuditLog } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminAudit");
  return { title: t("title") };
}

const PAGE_SIZE = 100;

/** Audit log of administrative actions, newest first; filter by action prefix or target id. */
export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requirePermission("audit.view", "/audit");
  const params = await searchParams;
  const action = typeof params.action === "string" ? params.action.trim().slice(0, 60) : "";
  const target = typeof params.target === "string" ? params.target.trim().slice(0, 64) : "";
  const before =
    typeof params.before === "string" && !Number.isNaN(Date.parse(params.before))
      ? new Date(params.before)
      : undefined;
  const [entries, t, format] = await Promise.all([
    listAuditLog({ action: action || undefined, targetId: target || undefined, before }, PAGE_SIZE),
    getTranslations("adminAudit"),
    getFormatter(),
  ]);
  const last = entries.at(-1);
  const next = new URLSearchParams({ ...(action ? { action } : {}), ...(target ? { target } : {}) });
  if (last) next.set("before", last.createdAt.toISOString());

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <form className="flex flex-wrap gap-2" action="/audit">
        <Input
          name="action"
          defaultValue={action}
          placeholder={t("action")}
          aria-label={t("action")}
          className="h-8 w-56"
        />
        <Input
          name="target"
          defaultValue={target}
          placeholder={t("target")}
          aria-label={t("target")}
          className="h-8 w-72"
        />
        <Button type="submit" size="sm" variant="outline">
          {t("filter")}
        </Button>
      </form>
      {entries.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm" data-testid="audit-log">
            <thead className="bg-muted/50">
              <tr>
                {(["when", "who", "action", "target", "details"] as const).map((column) => (
                  <th key={column} className="px-4 py-2 font-medium">
                    {t(`columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t align-top">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {format.dateTime(entry.createdAt, { dateStyle: "short", timeStyle: "medium" })}
                  </td>
                  <td className="px-4 py-2">
                    {entry.actor?.email ?? t("system")}
                    {entry.ip && <div className="text-xs text-muted-foreground">{entry.ip}</div>}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{entry.action}</td>
                  <td className="px-4 py-2 text-xs">
                    {entry.targetType && (
                      <Link href={`/audit?target=${entry.targetId}`} className="hover:underline">
                        {entry.targetType} {entry.targetId}
                      </Link>
                    )}
                  </td>
                  <td className="max-w-80 px-4 py-2 font-mono text-xs break-words text-muted-foreground">
                    {entry.metadata ? JSON.stringify(entry.metadata) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {entries.length === PAGE_SIZE && (
        <Link href={`/audit?${next}`} className="text-sm hover:underline">
          {t("older")} →
        </Link>
      )}
    </main>
  );
}
