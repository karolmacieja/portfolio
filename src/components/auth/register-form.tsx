"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAction, type AuthFormState } from "@/server/auth/actions";

export function RegisterForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<AuthFormState, FormData>(registerAction, {});
  const fieldError = (field: string) => {
    const key = state.fieldErrors?.[field];
    // Keys are validated message paths under `auth`.
    return key ? t(key as Parameters<typeof t>[0]) : undefined;
  };

  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormError message={state.error ? t(`errors.${state.error}`) : undefined} />

      <div className="grid gap-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" autoComplete="name" required maxLength={100} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
        {fieldError("email") && <p className="text-sm text-destructive">{fieldError("email")}</p>}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby="password-hint"
        />
        <p
          id="password-hint"
          className={fieldError("password") ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {fieldError("password") ?? t("passwordHint")}
        </p>
      </div>

      {/* Honeypot for bots; hidden from people and assistive tech. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Button type="submit" disabled={pending}>
        {t("submitRegister")}
      </Button>
    </form>
  );
}
