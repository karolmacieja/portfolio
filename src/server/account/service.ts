import "server-only";

import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";

/** Owner-scoped account operations: profile, password and the RODO data export (art. 15/20). */

export async function getAccount(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      locale: true,
      role: true,
      emailVerified: true,
      passwordHash: true,
      deletionScheduledAt: true,
      marketingConsent: true,
      createdAt: true,
      accounts: { select: { provider: true } },
    },
  });
}

export async function updateProfile(userId: string, input: { name: string; locale: string }) {
  await db.user.update({ where: { id: userId }, data: { name: input.name, locale: input.locale } });
}

/**
 * Changes the password. Accounts with a password must confirm the current one; magic-link/Google accounts
 * set their first password. Other sessions end on their next refresh (`passwordChangedAt`).
 */
export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<"ok" | "wrongPassword"> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (user.passwordHash && !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    return "wrongPassword";
  }
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(input.newPassword), passwordChangedAt: new Date() },
  });
  return "ok";
}

/** Everything we hold about the client, as JSON (no secrets: password hashes and OAuth tokens are left out). */
export async function exportUserData(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      locale: true,
      emailVerified: true,
      termsVersion: true,
      termsAcceptedAt: true,
      marketingConsent: true,
      marketingConsentAt: true,
      createdAt: true,
      accounts: { select: { provider: true } },
      billingProfile: true,
      subscriptions: { include: { plan: { select: { name: true } } } },
      payments: { omit: { userId: true } },
      invoices: {
        select: {
          number: true,
          kind: true,
          status: true,
          netAmount: true,
          vatAmount: true,
          grossAmount: true,
          currency: true,
          issueDate: true,
          buyer: true,
        },
      },
      templatePurchases: { select: { templateId: true, amount: true, currency: true, createdAt: true } },
      domainOrders: { omit: { userId: true } },
      assets: {
        select: { url: true, originalName: true, contentType: true, sizeBytes: true, createdAt: true },
      },
      clientNotes: { select: { body: true, createdAt: true } },
      sites: {
        include: {
          pages: {
            select: {
              path: true,
              title: true,
              draftContent: true,
              publishedContent: true,
              publishedAt: true,
              seoTitle: true,
              seoDescription: true,
              ogImageUrl: true,
            },
          },
          domains: { select: { hostname: true, type: true, status: true, createdAt: true } },
          contactMessages: {
            select: { path: true, name: true, email: true, message: true, createdAt: true },
          },
        },
      },
    },
  });
  return { exportedAt: new Date().toISOString(), format: "portfolio-export/1", user };
}
