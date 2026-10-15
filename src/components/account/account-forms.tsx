"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/server/action-state";
import {
  cancelDeletionAction,
  changePasswordAction,
  requestDeletionAction,
  requestPasswordResetAction,
  resetPasswordAction,
  updateProfileAction,
} from "@/server/account/actions";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs";

export function ProfileForm({ name, locale }: { name: string; locale: string }) {
  const t = useTranslations("account");
  const [state, action, pending] = useActionState<ActionState, FormData>(updateProfileAction, {});
  return (
    <form action={action} className="grid gap-4" data-testid="profile-form">
      <div className="grid gap-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" defaultValue={name} required maxLength={100} autoComplete="name" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="locale">{t("language")}</Label>
        <select id="locale" name="locale" defaultValue={locale} className={selectClass}>
          <option value="pl">Polski</option>
          <option value="en">English</option>
        </select>
      </div>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {t("save")}
        </Button>
      </div>
      <FormMessage state={state} success={t("saved")} />
    </form>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations("account");
  const [state, action, pending] = useActionState<ActionState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="grid gap-4" data-testid="password-form">
      {hasPassword && (
        <div className="grid gap-2">
          <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="newPassword">{t("newPassword")}</Label>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
        <p className="text-sm text-muted-foreground">{t("passwordHint")}</p>
      </div>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {hasPassword ? t("changePassword") : t("setPassword")}
        </Button>
      </div>
      <FormMessage state={state} success={t("passwordChanged")} />
    </form>
  );
}

export function DeleteAccountForm({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations("account");
  const [state, action, pending] = useActionState<ActionState, FormData>(requestDeletionAction, {});
  return (
    <form
      action={action}
      className="grid gap-4"
      data-testid="delete-account-form"
      onSubmit={(event) => {
        if (!window.confirm(t("deleteConfirm"))) event.preventDefault();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="confirmEmail">{t("confirmEmail")}</Label>
        <Input id="confirmEmail" name="email" type="email" required autoComplete="off" />
      </div>
      {hasPassword && (
        <div className="grid gap-2">
          <Label htmlFor="deletePassword">{t("currentPassword")}</Label>
          <Input
            id="deletePassword"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
      )}
      <div>
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          {t("deleteSubmit")}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function CancelDeletionForm() {
  const t = useTranslations("account");
  const [state, action, pending] = useActionState<ActionState, FormData>(cancelDeletionAction, {});
  return (
    <form action={action} className="grid gap-2">
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {t("cancelDeletion")}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations("account");
  const [state, action, pending] = useActionState<ActionState, FormData>(requestPasswordResetAction, {});
  if (state.ok) {
    return (
      <p className="text-sm" role="status" data-testid="reset-sent">
        {t("resetSent")}
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
        />
      </div>
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />
      <Button type="submit" disabled={pending}>
        {t("sendResetLink")}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("account");
  const [state, action, pending] = useActionState<ActionState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-2">
        <Label htmlFor="password">{t("newPassword")}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
        <p className="text-sm text-muted-foreground">{t("passwordHint")}</p>
      </div>
      <Button type="submit" disabled={pending}>
        {t("setPassword")}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
