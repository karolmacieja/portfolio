import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import type { Role } from "@/generated/prisma/enums";

import type { ImpersonationClaim } from "./next-auth";

import { hasPermission, type Permission } from "./permissions";
import { hasRole } from "./roles";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  locale: string;
  /** Set while staff act as this client. */
  impersonation?: ImpersonationClaim;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    role: user.role,
    locale: user.locale,
    ...(user.impersonation ? { impersonation: user.impersonation } : {}),
  };
}

/** Redirects to the login page when there is no session. */
export async function requireUser(callbackUrl?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const query = callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : "";
    redirect(`/login${query}`);
  }
  return user;
}

/** Requires one of `roles`; signed-in users without it are sent to the forbidden page. */
export async function requireRole(roles: readonly Role[], callbackUrl?: string): Promise<SessionUser> {
  const user = await requireUser(callbackUrl);
  if (!hasRole(user.role, roles)) redirect("/forbidden");
  return user;
}

/** Requires a staff permission (see permissions.ts); others are sent to the forbidden page. */
export async function requirePermission(permission: Permission, callbackUrl?: string): Promise<SessionUser> {
  const user = await requireUser(callbackUrl);
  if (!hasPermission(user.role, permission)) redirect("/forbidden");
  return user;
}

/**
 * For payments and purchases: refused while staff impersonate the client (owner decision). Server
 * actions return this as an error key instead of acting.
 */
export function isImpersonating(user: SessionUser): boolean {
  return Boolean(user.impersonation);
}
