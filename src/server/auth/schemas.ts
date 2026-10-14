import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 10;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, "passwordRules.tooShort")
  .max(128, "passwordRules.tooLong")
  .regex(/[a-zA-Z]/, "passwordRules.needsLetter")
  .regex(/\d/, "passwordRules.needsDigit");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordSchema,
  // Honeypot: real users never fill it.
  website: z.string().max(0).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
