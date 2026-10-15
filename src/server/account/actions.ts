"use server";

import { cookies, headers } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { signIn, signOut } from "@/auth";
import { LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/request";
import { formValues, type ActionState } from "@/server/action-state";
import { verifyPassword } from "@/server/auth/password";
import { currentTermsVersion } from "@/server/legal/service";
import { isImpersonating, requireUser } from "@/server/auth/session";
import { getRateLimiter, RATE_LIMITS } from "@/server/rate-limit/limiter";

import { AccountError, cancelAccountDeletion, requestAccountDeletion } from "./deletion";
import { nextAccountDeps } from "./deps";
import { requestPasswordReset, resetPassword } from "./password-reset";
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  profileSchema,
  resetPasswordSchema,
} from "./schemas";
import { changePassword, updateProfile } from "./service";

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account");
  const parsed = profileSchema.safeParse(formValues(formData));
  if (!parsed.success) return { error: "account.errors.invalid", values: formValues(formData) };
  await updateProfile(user.id, parsed.data);
  if (!isImpersonating(user)) {
    (await cookies()).set(LOCALE_COOKIE, parsed.data.locale, {
      path: "/",
      maxAge: 365 * 86_400,
      sameSite: "lax",
    });
  }
  refresh();
  return { ok: true };
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account");
  if (isImpersonating(user)) return { error: "account.errors.impersonation" };
  const parsed = changePasswordSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.path[0] === "newPassword");
    return { error: issue ? `auth.${issue.message}` : "account.errors.invalid" };
  }
  const { limit, windowMs } = RATE_LIMITS.signInPerEmail;
  if (!(await getRateLimiter().hit(`password-change:${user.id}`, limit, windowMs)).allowed) {
    return { error: "account.errors.rateLimited" };
  }
  if ((await changePassword(user.id, parsed.data)) === "wrongPassword") {
    return { error: "account.errors.wrongPassword" };
  }
  // Other sessions end; this one signs in again with the new password.
  await signIn("credentials", { email: user.email, password: parsed.data.newPassword, redirect: false });
  return { ok: true };
}

export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) return { error: "account.errors.invalidEmail", values };
  const ip = getClientIp(await headers());
  const limiter = getRateLimiter();
  const perEmail = RATE_LIMITS.passwordResetPerEmail;
  const perIp = RATE_LIMITS.passwordResetPerIp;
  if (
    !(await limiter.hit(`reset-ip:${ip}`, perIp.limit, perIp.windowMs)).allowed ||
    !(await limiter.hit(`reset-email:${parsed.data.email}`, perEmail.limit, perEmail.windowMs)).allowed
  ) {
    return { error: "account.errors.rateLimited", values };
  }
  // Same answer whether or not the account exists.
  await requestPasswordReset(parsed.data.email, (await getLocale()) as Locale);
  return { ok: true };
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.path[0] === "password");
    return { error: issue ? `auth.${issue.message}` : "account.errors.resetInvalid" };
  }
  const email = await resetPassword(parsed.data.token, parsed.data.password);
  if (!email) return { error: "account.errors.resetInvalid" };
  await signIn("credentials", { email, password: parsed.data.password, redirectTo: "/dashboard" });
  return { ok: true };
}

export async function requestDeletionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account");
  if (isImpersonating(user)) return { error: "account.errors.impersonation" };
  const parsed = deleteAccountSchema.safeParse(formValues(formData));
  if (!parsed.success || parsed.data.email !== user.email.toLowerCase()) {
    return { error: "account.errors.confirmEmail" };
  }
  const { passwordHash } = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (passwordHash && !(await verifyPassword(passwordHash, parsed.data.password))) {
    return { error: "account.errors.wrongPassword" };
  }
  try {
    await requestAccountDeletion(user.id, nextAccountDeps());
  } catch (error) {
    if (error instanceof AccountError) return { error: `account.errors.${error.code}` };
    console.error("[account] deletion request failed", error);
    return { error: "account.errors.provider" };
  }
  refresh();
  return { ok: true };
}

export async function cancelDeletionAction(_prev: ActionState): Promise<ActionState> {
  const user = await requireUser("/account");
  try {
    await cancelAccountDeletion(user.id, nextAccountDeps());
  } catch (error) {
    if (error instanceof AccountError) return { error: `account.errors.${error.code}` };
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function acceptTermsAction(_prev: ActionState): Promise<ActionState> {
  const user = await requireUser("/dashboard");
  if (isImpersonating(user)) return { error: "account.errors.impersonation" };
  await db.user.update({
    where: { id: user.id },
    data: { termsVersion: await currentTermsVersion(), termsAcceptedAt: new Date() },
  });
  refresh();
  return { ok: true };
}

export async function signOutEverywhereAction(): Promise<void> {
  const user = await requireUser("/account");
  await db.user.update({ where: { id: user.id }, data: { passwordChangedAt: new Date() } });
  await signOut({ redirect: false });
  redirect("/login");
}
