import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default async function EmailVerifiedPage({ searchParams }: PageProps<"/panel/email-verified">) {
  const { status } = await searchParams;
  const ok = status === "ok";
  const t = await getTranslations();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          {ok ? t("auth.emailVerifiedTitle") : t("auth.emailVerifyFailedTitle")}
        </CardTitle>
        <CardDescription>
          {ok ? t("auth.emailVerifiedDescription") : t("auth.emailVerifyFailedDescription")}
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild className="w-full">
          <Link href="/dashboard">{t("common.dashboard")}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
