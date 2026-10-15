import "server-only";

import { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

import { AdminError } from "./clients";

/** Panel team (ADMIN only): who is staff and with which role. Not owner-scoped. */

export async function listStaff() {
  return db.user.findMany({
    where: { role: { in: [Role.ADMIN, Role.SUPPORT] } },
    orderBy: [{ role: "asc" }, { email: "asc" }],
    select: { id: true, email: true, name: true, role: true, blockedAt: true, createdAt: true },
  });
}

/**
 * Changes a user's role (CLIENT = removed from the team). Nobody changes their own role, and the last
 * active ADMIN can't be demoted, so the panel is never left without an administrator.
 */
export async function setUserRole(actorId: string, email: string, role: Role) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) throw new AdminError("notFound");
  if (user.id === actorId) throw new AdminError("selfAction");
  if (user.role === Role.ADMIN && role !== Role.ADMIN) {
    const admins = await db.user.count({ where: { role: Role.ADMIN, blockedAt: null } });
    if (admins <= 1) throw new AdminError("lastAdmin");
  }
  await db.user.update({ where: { id: user.id }, data: { role } });
  return { id: user.id, previous: user.role };
}
