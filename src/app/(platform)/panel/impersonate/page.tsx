import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { describeImpersonationToken } from "@/server/admin/impersonation";
import { completeImpersonationAction } from "@/server/admin/impersonation-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("impersonation");
  return { title: t("title"), robots: { index: false } };
}

/** Confirmation step on the app host: the token is redeemed by an explicit POST, never by visiting the link. */
export default async function ImpersonatePage({ searchParams }: PageProps<"/panel/impersonate">) {
  const { token } = await searchParams;
  const t = await getTranslations("impersonation");
  const details = typeof token === "string" ? await describeImpersonationToken(token) : null;
  return (
    <main className="mx-auto grid max-w-md gap-4 px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {details ? (
            <>
              <p>{t("confirm", { email: details.userEmail })}</p>
              <p className="text-muted-foreground">{t("reason", { reason: details.reason })}</p>
              <p className="text-muted-foreground">{t("rules")}</p>
            </>
          ) : (
            <p className="text-destructive">{t("invalid")}</p>
          )}
        </CardContent>
        {details && (
          <CardFooter>
            <form action={completeImpersonationAction}>
              <input type="hidden" name="token" value={token as string} />
              <Button type="submit">{t("continue")}</Button>
            </form>
          </CardFooter>
        )}
      </Card>
    </main>
  );
}
