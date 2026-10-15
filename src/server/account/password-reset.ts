import "server-only";

import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { getEnv, platformUrl } from "@/lib/env";
import type { Locale } from "@/i18n/config";
import { hashToken } from "@/server/auth/email-verification";
import { hashPassword } from "@/server/auth/password";
import { getMailer } from "@/server/mail";
import { buildLinkMail } from "@/server/mail/templates";

/**
 * "Forgot password": a single-use link (1 hour) mailed to the address. The request never reveals whether
 * an account exists. Resetting sets the password, marks the email verified (the link proves ownership)
 * and ends every existing session (`passwordChangedAt`).
 */

const IDENTIFIER_PREFIX = "reset-password:";
const TTL_MS = 60 * 60 * 1000;

export async function requestPasswordReset(email: string, locale: Locale): Promise<void> {
  const user = await db.user.findUnique({ where: { email }, select: { blockedAt: true, deletedAt: true } });
  if (!user || user.blockedAt || user.deletedAt) return;
  const identifier = IDENTIFIER_PREFIX + email;
  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.verificationToken.deleteMany({ where: { identifier } }),
    db.verificationToken.create({
      data: { identifier, token: hashToken(token), expires: new Date(Date.now() + TTL_MS) },
    }),
  ]);
  const mail = await buildLinkMail({
    kind: "passwordReset",
    to: email,
    url: platformUrl("app", `/reset-password?token=${encodeURIComponent(token)}`),
    locale,
    brand: getEnv().BRAND_NAME,
  });
  await getMailer().send(mail);
}

/** Whether a reset link is still usable (the page shows the form only then). */
export async function isPasswordResetTokenValid(token: string): Promise<boolean> {
  const record = await db.verificationToken.findUnique({ where: { token: hashToken(token) } });
  return Boolean(record?.identifier.startsWith(IDENTIFIER_PREFIX) && record.expires > new Date());
}

/** Returns the account email on success, null for an invalid or expired link. */
export async function resetPassword(token: string, password: string): Promise<string | null> {
  const record = await db.verificationToken.findUnique({ where: { token: hashToken(token) } });
  if (!record || !record.identifier.startsWith(IDENTIFIER_PREFIX)) return null;
  await db.verificationToken.delete({ where: { token: record.token } });
  if (record.expires < new Date()) return null;
  const email = record.identifier.slice(IDENTIFIER_PREFIX.length);
  const passwordHash = await hashPassword(password);
  const now = new Date();
  const { count } = await db.user.updateMany({
    where: { email, blockedAt: null, deletedAt: null },
    data: { passwordHash, passwordChangedAt: now },
  });
  if (!count) return null;
  await db.user.updateMany({ where: { email, emailVerified: null }, data: { emailVerified: now } });
  return email;
}
