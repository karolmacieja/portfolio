import { db } from "@/lib/db";

import { buildEntitlements, ENTITLED_STATUSES, type Entitlements } from "./rules";

// No "server-only" here: the background worker (plain Node) needs entitlements too.

/**
 * Loads a user's entitlements: the newest entitled subscription's plan, otherwise the entry plan's
 * limits without publishing or paid features. Deliberately not memoized (React `cache` outside a
 * render memoizes forever, which would hide plan changes); it's two indexed queries.
 */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  const [subscription, fallbackPlan] = await Promise.all([
    db.subscription.findFirst({
      where: { userId, status: { in: [...ENTITLED_STATUSES] } },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    }),
    db.plan.findFirst({ where: { isActive: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
  ]);
  return buildEntitlements(subscription, fallbackPlan);
}
