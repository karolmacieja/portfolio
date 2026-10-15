import { LicenseSource, LicenseStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

import { buildEntitlements, ENTITLED_STATUSES, type Entitlements, type LicenseLike } from "./rules";

// No "server-only" here: the background worker (plain Node) needs entitlements too.

/** License statuses that grant the plan to members (a past-due license keeps working while it is retried). */
export const ACTIVE_LICENSE_STATUSES: LicenseStatus[] = [LicenseStatus.ACTIVE, LicenseStatus.PAST_DUE];

/** Whether an organization's license currently grants its plan (manual licenses also check their end date). */
export function isLicenseActive(
  organization: { status: LicenseStatus; source: LicenseSource; validUntil: Date | null },
  now = new Date(),
): boolean {
  if (!ACTIVE_LICENSE_STATUSES.includes(organization.status)) return false;
  return (
    organization.source !== LicenseSource.MANUAL || !organization.validUntil || organization.validUntil > now
  );
}

/** The user's active license seat, if any. */
export async function loadLicense(userId: string): Promise<LicenseLike | null> {
  const member = await db.organizationMember.findUnique({
    where: { userId },
    include: { organization: { include: { plan: true } } },
  });
  if (!member || !isLicenseActive(member.organization)) return null;
  const { organization } = member;
  return {
    organization: {
      id: organization.id,
      name: organization.name,
      membersCanBuyDomains: organization.membersCanBuyDomains,
    },
    plan: organization.plan,
  };
}

/**
 * Loads a user's entitlements: the better of the newest entitled subscription and an active license seat,
 * otherwise the entry plan's limits without publishing or paid features. Deliberately not memoized (React
 * `cache` outside a render memoizes forever, which would hide plan changes); a few indexed queries.
 */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  const [subscription, fallbackPlan, license] = await Promise.all([
    db.subscription.findFirst({
      where: { userId, status: { in: [...ENTITLED_STATUSES] } },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    }),
    db.plan.findFirst({ where: { isActive: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    loadLicense(userId),
  ]);
  return buildEntitlements(subscription, fallbackPlan, license);
}
