import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ResetPasswordForm } from "@/components/account/account-forms";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isPasswordResetTokenValid } from "@/server/account/password-reset";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("resetTitle") };
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/panel/reset-password">) {
  const { token } = await searchParams;
  const t = await getTranslations("account");
  const valid = typeof token === "string" && (await isPasswordResetTokenValid(token));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t("resetTitle")}</CardTitle>
        {valid && <CardDescription>{t("resetDescription")}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4">
        {valid ? (
          <ResetPasswordForm token={token} />
        ) : (
          <>
            <Alert variant="destructive">{t("errors.resetInvalid")}</Alert>
            <Link href="/forgot-password" className="text-sm underline">
              {t("forgotTitle")}
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
