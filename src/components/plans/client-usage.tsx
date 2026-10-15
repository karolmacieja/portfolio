import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can, getEntitlements } from "@/server/entitlements";
import { getClientUsage } from "@/server/finance/usage";

/** The client's activity across all their sites in the last 30 days (dashboard). */
export async function ClientUsage({ userId }: { userId: string }) {
  const [usage, entitlements, t, format] = await Promise.all([
    getClientUsage(userId),
    getEntitlements(userId),
    getTranslations("dashboard.usage"),
    getFormatter(),
  ]);
  const analytics = can(entitlements, "analytics");
  const items = [
    { key: "views", value: analytics ? format.number(usage.views30) : null },
    { key: "published", value: `${usage.published} / ${usage.sites}` },
    { key: "messages", value: format.number(usage.messages30) },
  ] as const;
  return (
    <Card data-testid="client-usage">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.key} className="grid gap-1">
            <p className="text-sm text-muted-foreground">{t(item.key)}</p>
            {item.value === null ? (
              <Link href="/plans" className="text-sm underline">
                {t("viewsLocked")}
              </Link>
            ) : (
              <p className="text-2xl font-semibold" data-testid={`client-usage-${item.key}`}>
                {item.value}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
