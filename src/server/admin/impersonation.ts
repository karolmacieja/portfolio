import "server-only";

import { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getEnv, platformUrl } from "@/lib/env";
import { createSignedToken, verifySignedToken } from "@/lib/signed-token";
import { hasPermission } from "@/server/auth/permissions";

import { AdminError } from "./clients";

/**
 * Impersonation (owner decision: full access except payments). Staff start a session in the admin
 * panel with a reason; a single-use signed token (1 minute) is redeemed on the app host through the
 * "impersonation" credentials provider. The client session then carries an impersonation claim:
 * a banner is shown, payments are refused, and it ends after 30 minutes or when ended.
 */

export const IMPERSONATION_MINUTES = 30;
const TOKEN_PURPOSE = "impersonate";
const TOKEN_TTL_SECONDS = 60;

export async function startImpersonation(admin: { id: string }, userId: string, reason: string) {
  if (admin.id === userId) throw new AdminError("selfAction");
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, blockedAt: true } });
  if (!user) throw new AdminError("notFound");
  if (user.role !== Role.CLIENT) throw new AdminError("staffOnly");
  if (user.blockedAt) throw new AdminError("blocked");
  const session = await db.impersonationSession.create({
    data: {
      adminId: admin.id,
      userId,
      reason,
      expiresAt: new Date(Date.now() + IMPERSONATION_MINUTES * 60_000),
    },
  });
  const token = createSignedToken(
    { sessionId: session.id },
    getEnv().AUTH_SECRET,
    TOKEN_PURPOSE,
    TOKEN_TTL_SECONDS,
  );
  return { session, url: platformUrl("app", `/impersonate?token=${encodeURIComponent(token)}`) };
}

/** Describes a pending token for the confirmation page (null when invalid, used or expired). */
export async function describeImpersonationToken(token: string) {
  const payload = verifySignedToken<{ sessionId: string }>(token, getEnv().AUTH_SECRET, TOKEN_PURPOSE);
  if (!payload) return null;
  const session = await db.impersonationSession.findUnique({
    where: { id: payload.sessionId },
    include: { user: { select: { email: true } }, admin: { select: { email: true } } },
  });
  if (!session || session.usedAt || session.endedAt || session.expiresAt < new Date()) return null;
  return { userEmail: session.user.email, adminEmail: session.admin.email, reason: session.reason };
}

/** Redeems a token (once); returns the client to sign in as, with the impersonation claim. */
export async function consumeImpersonationToken(token: string) {
  const payload = verifySignedToken<{ sessionId: string }>(token, getEnv().AUTH_SECRET, TOKEN_PURPOSE);
  if (!payload) return null;
  const session = await db.impersonationSession.findUnique({
    where: { id: payload.sessionId },
    include: { admin: true, user: true },
  });
  if (!session || session.endedAt || session.expiresAt < new Date()) return null;
  // The staff member must still be allowed to do it, the client must still be a non-blocked client.
  if (session.admin.blockedAt || !hasPermission(session.admin.role, "clients.impersonate")) return null;
  if (session.user.blockedAt || session.user.role !== Role.CLIENT) return null;
  const { count } = await db.impersonationSession.updateMany({
    where: { id: session.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count !== 1) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
    impersonation: {
      sessionId: session.id,
      adminEmail: session.admin.email,
      expiresAt: session.expiresAt.getTime(),
    },
  };
}

export async function isImpersonationActive(sessionId: string): Promise<boolean> {
  const session = await db.impersonationSession.findUnique({
    where: { id: sessionId },
    select: { endedAt: true, expiresAt: true },
  });
  return Boolean(session && !session.endedAt && session.expiresAt > new Date());
}

export async function endImpersonation(sessionId: string): Promise<void> {
  await db.impersonationSession.updateMany({
    where: { id: sessionId, endedAt: null },
    data: { endedAt: new Date() },
  });
}
