import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { safeCallbackUrl } from "@/lib/safe-redirect";
import { isGoogleEnabled } from "@/server/auth/config";
import { getCurrentUser } from "@/server/auth/session";

// Error codes Auth.js appends to the sign-in page URL.
function mapAuthJsError(error: unknown) {
  if (typeof error !== "string") return undefined;
  if (error === "AccessDenied") return "accessDenied" as const;
  if (error === "OAuthAccountNotLinked") return "oauthAccountNotLinked" as const;
  return "generic" as const;
}

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
  /** Where to go after signing in when no callbackUrl is given (differs per host). */
  defaultRedirect: string;
  showRegisterLink: boolean;
};

/** Sign-in page body shared by the client panel (app.) and the admin panel (admin.). */
export async function LoginCard({ searchParams, defaultRedirect, showRegisterLink }: Props) {
  const callbackUrl = safeCallbackUrl(searchParams.callbackUrl, defaultRedirect);
  if (await getCurrentUser()) redirect(callbackUrl);

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
          initialError={mapAuthJsError(searchParams.error)}
        />
      </CardContent>
      {showRegisterLink && (
        <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
          {t("noAccount")}
          <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
            {t("submitRegister")}
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}
