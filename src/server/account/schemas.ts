import { z } from "zod";

import { locales } from "@/i18n/config";
import { emailSchema, passwordSchema } from "@/server/auth/schemas";

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  locale: z.enum(locales),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128).default(""),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema, website: z.string().max(0).optional() });

export const resetPasswordSchema = z.object({ token: z.string().min(10).max(200), password: passwordSchema });

/** Deleting the account: the client types their email; accounts with a password also confirm it. */
export const deleteAccountSchema = z.object({
  email: emailSchema,
  password: z.string().max(128).default(""),
});
