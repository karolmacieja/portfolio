import { Role } from "@/generated/prisma/enums";

export { Role };

/** Roles allowed into the admin panel. SUPPORT has read/limited access, enforced per action. */
export const STAFF_ROLES: readonly Role[] = [Role.ADMIN, Role.SUPPORT];

export function hasRole(role: Role | undefined | null, allowed: readonly Role[]): boolean {
  return role != null && allowed.includes(role);
}

export function isStaff(role: Role | undefined | null): boolean {
  return hasRole(role, STAFF_ROLES);
}

export function isAdmin(role: Role | undefined | null): boolean {
  return role === Role.ADMIN;
}
