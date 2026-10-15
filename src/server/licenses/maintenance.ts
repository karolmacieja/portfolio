import { LicenseSource, LicenseStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { BillingDeps } from "@/server/billing/deps";

import { applyLicenseStatus } from "./billing";

/** Worker, hourly: manual licenses past their end date expire (members without a plan are paused). */
export async function expireManualLicenses(
  deps: Pick<BillingDeps, "invalidate" | "mailer" | "brand" | "billingUrl" | "now">,
): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const due = await db.organization.findMany({
    where: {
      source: LicenseSource.MANUAL,
      status: { in: [LicenseStatus.ACTIVE, LicenseStatus.PAST_DUE] },
      validUntil: { lte: now },
    },
    select: { id: true },
  });
  for (const org of due) {
    await db.organization.update({ where: { id: org.id }, data: { status: LicenseStatus.EXPIRED } });
    await applyLicenseStatus(org.id, false, deps);
  }
  return due.length;
}
