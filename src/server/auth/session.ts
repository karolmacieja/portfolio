import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import type { Role } from "@/generated/prisma/enums";

import { hasRole } from "./roles";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  locale: string;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return { id: user.id, email: user.email, name: user.name ?? null, role: user.role, locale: user.locale };
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
