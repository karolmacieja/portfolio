import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("registerTitle") };
}

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const t = await getTranslations("auth");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t("registerTitle")}</CardTitle>
        <CardDescription>{t("registerDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
      </CardContent>
      <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
        {t("haveAccount")}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          {t("submitSignIn")}
        </Link>
      </CardFooter>
    </Card>
  );
}
