import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { getEnv, platformUrl } from "@/lib/env";
import type { Locale } from "@/i18n/config";
import { getMailer } from "@/server/mail";
import { buildLinkMail } from "@/server/mail/templates";

const IDENTIFIER_PREFIX = "verify-email:";
const TTL_MS = 48 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Issues a single-use email verification link and mails it. Previous links for the address are revoked. */
export async function sendEmailVerification(email: string, locale: Locale): Promise<void> {
  const identifier = IDENTIFIER_PREFIX + email;
  const token = randomBytes(32).toString("base64url");

  await db.$transaction([
    db.verificationToken.deleteMany({ where: { identifier } }),
    db.verificationToken.create({
      data: { identifier, token: hashToken(token), expires: new Date(Date.now() + TTL_MS) },
    }),
  ]);

  const url = platformUrl("app", `/api/email/verify?token=${encodeURIComponent(token)}`);
  const mail = await buildLinkMail({
    kind: "verifyEmail",
    to: email,
    url,
    locale,
    brand: getEnv().BRAND_NAME,
  });
  await getMailer().send(mail);
}

/** Consumes a verification token. Returns true when the user's email got (or already was) verified. */
export async function consumeEmailVerification(token: string): Promise<boolean> {
  const record = await db.verificationToken.findUnique({ where: { token: hashToken(token) } });
  if (!record || !record.identifier.startsWith(IDENTIFIER_PREFIX)) return false;

  await db.verificationToken.delete({ where: { token: record.token } });
  if (record.expires < new Date()) return false;

  const email = record.identifier.slice(IDENTIFIER_PREFIX.length);
  const { count } = await db.user.updateMany({
    where: { email, emailVerified: null },
    data: { emailVerified: new Date() },
  });
  return count > 0 || (await db.user.count({ where: { email, emailVerified: { not: null } } })) > 0;
}
