import { Role } from "@/generated/prisma/enums";

/**
 * Staff permissions per admin action. Owner decision (Phase 8): SUPPORT may do almost everything;
 * staff roles, platform settings and the plan catalog (prices, limits, block tiers) stay with ADMIN.
 */
export const PERMISSIONS = [
  "clients.view",
  "clients.manage",
  "clients.impersonate",
  "payments.refund",
  "plans.grant",
  "invoices.manage",
  "domains.manage",
  "sites.moderate",
  "coupons.manage",
  "templates.manage",
  "licenses.manage",
  "finance.view",
  "newsletter.manage",
  "audit.view",
  "plans.manage",
  "settings.manage",
  "staff.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Profit and cost figures are business-sensitive like the settings they come from.
const ADMIN_ONLY: ReadonlySet<Permission> = new Set([
  "plans.manage",
  "settings.manage",
  "staff.manage",
  "finance.view",
]);

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (role === Role.ADMIN) return true;
  return role === Role.SUPPORT && !ADMIN_ONLY.has(permission);
}
