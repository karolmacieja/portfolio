import { z } from "zod";

import type { SubscriptionStatus } from "@/generated/prisma/client";
import { CampaignType, Role, type Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ACTIVE_LICENSE_STATUSES } from "@/server/entitlements/load";
import { ENTITLED_STATUSES } from "@/server/entitlements/rules";

/** Who a campaign goes to. Marketing additionally requires the recipient's consent (checked again at send). */
export const audienceSchema = z.discriminatedUnion("segment", [
  z.object({ segment: z.literal("all") }),
  z.object({ segment: z.literal("plan"), planId: z.string().min(1) }),
  z.object({ segment: z.literal("noPlan") }),
  z.object({ segment: z.literal("license") }),
  z.object({ segment: z.literal("organization"), organizationId: z.string().min(1) }),
]);
export type Audience = z.infer<typeof audienceSchema>;

const entitledSub = { status: { in: [...ENTITLED_STATUSES] as SubscriptionStatus[] } };
const activeSeat = { organization: { status: { in: ACTIVE_LICENSE_STATUSES } } };

/** Active, reachable clients of the segment (never blocked, deleted or awaiting deletion). */
export function audienceWhere(audience: Audience, type: CampaignType): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = {
    role: Role.CLIENT,
    deletedAt: null,
    blockedAt: null,
    deletionScheduledAt: null,
    ...(type === CampaignType.MARKETING ? { marketingConsent: true } : {}),
  };
  switch (audience.segment) {
    case "all":
      return base;
    case "plan":
      return {
        ...base,
        OR: [
          { subscriptions: { some: { ...entitledSub, planId: audience.planId } } },
          {
            membership: {
              organization: { status: { in: ACTIVE_LICENSE_STATUSES }, planId: audience.planId },
            },
          },
        ],
      };
    case "noPlan":
      return {
        ...base,
        subscriptions: { none: entitledSub },
        OR: [{ membership: null }, { membership: { isNot: activeSeat } }],
      };
    case "license":
      return { ...base, membership: activeSeat };
    case "organization":
      return { ...base, membership: { organizationId: audience.organizationId } };
  }
}

export function countAudience(audience: Audience, type: CampaignType) {
  return db.user.count({ where: audienceWhere(audience, type) });
}
