import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { safeCallbackUrl } from "@/lib/safe-redirect";
import { isGoogleEnabled } from "@/server/auth/config";
import { getCurrentUser } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signInTitle") };
}

// Error codes Auth.js appends to the sign-in page URL.
function mapAuthJsError(error: string | undefined) {
  if (!error) return undefined;
  if (error === "AccessDenied") return "accessDenied" as const;
  if (error === "OAuthAccountNotLinked") return "oauthAccountNotLinked" as const;
  return "generic" as const;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" ? safeCallbackUrl(params.callbackUrl) : undefined;
  if (await getCurrentUser()) redirect(callbackUrl ?? "/dashboard");

  const t = await getTranslations("auth");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t("signInTitle")}</CardTitle>
        <CardDescription>{t("signInDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm
          callbackUrl={callbackUrl}
          googleEnabled={isGoogleEnabled()}
          initialError={mapAuthJsError(typeof params.error === "string" ? params.error : undefined)}
        />
      </CardContent>
      <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
        {t("noAccount")}
        <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
          {t("submitRegister")}
        </Link>
      </CardFooter>
    </Card>
  );
}
