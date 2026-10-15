"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signInWithGoogleAction,
  signInWithMagicLinkAction,
  signInWithPasswordAction,
  type AuthFormState,
} from "@/server/auth/actions";

type Props = {
  callbackUrl?: string;
  googleEnabled: boolean;
  /** Error key passed back by Auth.js redirects (e.g. OAuth failures). */
  initialError?: "accessDenied" | "oauthAccountNotLinked" | "generic";
  /** Password reset lives on the client panel host (staff accounts use it too). */
  forgotPasswordUrl: string;
};

export function LoginForm({ callbackUrl, googleEnabled, initialError, forgotPasswordUrl }: Props) {
  const tAccount = useTranslations("account");
  const t = useTranslations("auth");
  const [passwordState, passwordAction, passwordPending] = useActionState<AuthFormState, FormData>(
    signInWithPasswordAction,
    {},
  );
  const [magicState, magicAction, magicPending] = useActionState<AuthFormState, FormData>(
    signInWithMagicLinkAction,
    {},
  );

  const errorKey = passwordState.error ?? magicState.error ?? initialError;

  return (
    <div className="grid gap-6">
      <FormError message={errorKey ? t(`errors.${errorKey}`) : undefined} />

      <form action={passwordAction} className="grid gap-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
        <div className="grid gap-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={passwordState.email ?? magicState.email}
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">{t("password")}</Label>
            <a
              href={forgotPasswordUrl}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              {tAccount("forgotLink")}
            </a>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button type="submit" disabled={passwordPending}>
          {t("submitSignIn")}
        </Button>
      </form>

      <div className="grid gap-2 border-t pt-6">
        <p className="text-sm text-muted-foreground">{t("magicLinkDescription")}</p>
        <form action={magicAction} className="flex gap-2">
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-label={t("email")}
            placeholder={t("email")}
            defaultValue={magicState.email}
          />
          <Button type="submit" variant="outline" disabled={magicPending}>
            {t("magicLink")}
          </Button>
        </form>
      </div>

      {googleEnabled && (
        <form action={signInWithGoogleAction}>
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
          <Button type="submit" variant="outline" className="w-full">
            {t("google")}
          </Button>
        </form>
      )}
    </div>
  );
}
