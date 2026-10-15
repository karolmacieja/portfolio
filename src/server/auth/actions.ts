"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { getLocale } from "next-intl/server";

import { signIn, signOut } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/request";
import { safeCallbackUrl } from "@/lib/safe-redirect";
import { currentTermsVersion } from "@/server/legal/service";
import { getRateLimiter, RATE_LIMITS } from "@/server/rate-limit/limiter";

import { sendEmailVerification } from "./email-verification";
import { AUTH_ERROR_CODES } from "./errors";
import { hashPassword } from "./password";
import { emailSchema, registerSchema } from "./schemas";

/** `error` is a key under `auth.errors`, `fieldErrors` values are keys under `auth`. */
export type AuthFormState = {
  error?: AuthErrorKey;
  fieldErrors?: Partial<Record<string, string>>;
  email?: string;
  /** Registration: the name, kept when the form comes back with an error. */
  name?: string;
};

export type AuthErrorKey =
  "invalidCredentials" | "accountBlocked" | "rateLimited" | "emailTaken" | "invalidInput" | "generic";

const CODE_TO_KEY: Record<string, AuthErrorKey> = {
  [AUTH_ERROR_CODES.invalidCredentials]: "invalidCredentials",
  [AUTH_ERROR_CODES.accountBlocked]: "accountBlocked",
  [AUTH_ERROR_CODES.rateLimited]: "rateLimited",
};

function authErrorToKey(error: AuthError): AuthErrorKey {
  if (error.type === "CredentialsSignin") {
    const code = (error as AuthError & { code?: string }).code;
    return (code && CODE_TO_KEY[code]) || "invalidCredentials";
  }
  const cause = error.cause?.err;
  if (cause instanceof Error && cause.message.includes("rate limit")) return "rateLimited";
  return "generic";
}

export async function signInWithPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  try {
    await signIn("credentials", {
      email,
      password: String(formData.get("password") ?? ""),
      redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
    });
    return {};
  } catch (error) {
    // Successful sign-in throws a redirect, which must propagate.
    if (error instanceof AuthError) return { error: authErrorToKey(error), email };
    throw error;
  }
}

export async function signInWithMagicLinkAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "invalidInput", fieldErrors: { email: "errors.invalidInput" } };
  try {
    // Auth.js would redirect through /api/auth/verify-request; go straight to our page instead.
    await signIn("email", {
      email: parsed.data,
      redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) return { error: authErrorToKey(error), email: parsed.data };
    throw error;
  }
  redirect("/login/check-email");
}

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  await signIn("google", { redirectTo: safeCallbackUrl(formData.get("callbackUrl")) });
}

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = Object.fromEntries(formData);
  const parsed = registerSchema.safeParse(raw);
  const email = typeof raw.email === "string" ? raw.email : "";
  const name = typeof raw.name === "string" ? raw.name : "";
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      fieldErrors[field] ??=
        field === "password"
          ? issue.message
          : field === "terms"
            ? "errors.termsRequired"
            : "errors.invalidInput";
    }
    return { error: "invalidInput", fieldErrors, email, name };
  }

  const ip = getClientIp(await headers());
  const { limit, windowMs } = RATE_LIMITS.registerPerIp;
  if (!(await getRateLimiter().hit(`register:ip:${ip}`, limit, windowMs)).allowed) {
    return { error: "rateLimited", email, name };
  }

  const { password } = parsed.data;
  const locale = await getLocale();
  try {
    await db.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: await hashPassword(password),
        locale,
        termsVersion: await currentTermsVersion(),
        termsAcceptedAt: new Date(),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "emailTaken", fieldErrors: { email: "errors.emailTaken" }, email, name };
    }
    throw error;
  }

  try {
    await sendEmailVerification(parsed.data.email, locale);
  } catch (error) {
    // Verification is not required to sign in; the user can request a new link later.
    console.error("Failed to send verification email", error);
  }

  await signIn("credentials", { email: parsed.data.email, password, redirectTo: "/dashboard" });
  return {};
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
