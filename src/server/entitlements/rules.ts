import { z } from "zod";

import { walkBlocks } from "@/blocks/content";
import { BLOCK_TYPES, type BlockType } from "@/blocks/schemas";
import { SubscriptionStatus } from "@/generated/prisma/enums";

/**
 * Entitlement rules: pure functions over plan data, shared by the UI, API and services.
 * The DB loader lives in ./index.ts. Plans themselves are data (editable by admins).
 */

export const ACCESS_TIERS = ["basic", "pro", "business"] as const;
export type AccessTier = (typeof ACCESS_TIERS)[number];
export const accessTierSchema = z.enum(ACCESS_TIERS);

export const PLAN_FEATURES = [
  "customDomain",
  "domainPurchase",
  "removeBranding",
  "analytics",
  "formsExport",
] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

export const planFeaturesSchema = z.object({
  customDomain: z.boolean().default(false),
  domainPurchase: z.boolean().default(false),
  removeBranding: z.boolean().default(false),
  analytics: z.boolean().default(false),
  formsExport: z.boolean().default(false),
});
export type PlanFeatures = z.infer<typeof planFeaturesSchema>;
const NO_FEATURES: PlanFeatures = planFeaturesSchema.parse({});

/** Subscription statuses that grant the plan's entitlements. PAST_DUE keeps access during dunning (Phase 5). */
export const ENTITLED_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];

/** Default tier per block; `BlockAccess` rows override these. */
export const DEFAULT_BLOCK_TIERS: Record<BlockType, AccessTier> = {
  Hero: "basic",
  Text: "basic",
  Image: "basic",
  Gallery: "basic",
  Project: "basic",
  ProjectList: "basic",
  About: "basic",
  Skills: "basic",
  SocialLinks: "basic",
  ContactForm: "basic",
  Spacer: "basic",
  Video: "pro",
  Testimonials: "pro",
  Timeline: "pro",
  Columns: "pro",
  Heading: "basic",
  Buttons: "basic",
  Quote: "basic",
  Divider: "basic",
  IconList: "basic",
  Section: "pro",
  Pricing: "pro",
  Faq: "pro",
  Stats: "pro",
  Logos: "pro",
  FileDownload: "pro",
};

export type Limits = {
  maxSites: number;
  maxPagesPerSite: number;
  /** Null = unlimited. */
  maxProjects: number | null;
  storageMb: number;
};

/** Used only when no plan exists in the database at all. */
export const FALLBACK_LIMITS: Limits = { maxSites: 1, maxPagesPerSite: 5, maxProjects: 30, storageMb: 500 };

export type PlanLike = {
  id: string;
  slug: string;
  name: string;
  maxSites: number;
  maxPagesPerSite: number;
  maxProjects: number | null;
  storageMb: number;
  features: unknown;
  accessTiers: string[];
  /** Pricing order; a higher position is the better plan (used to pick between a license and a subscription). */
  position?: number;
};

/** An active group license seat (see Organization). */
export type LicenseLike = {
  organization: { id: string; name: string; membersCanBuyDomains: boolean };
  plan: PlanLike;
};

export type SubscriptionLike = {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  plan: PlanLike;
};

export type Entitlements = {
  /** Plan granted by an entitled subscription or a group license; null without one. */
  plan: { id: string; slug: string; name: string } | null;
  /** Where the plan comes from: the user's own subscription or a group license seat. */
  source: "subscription" | "license" | null;
  subscription: Omit<SubscriptionLike, "plan"> | null;
  /** The user's group license (also when their own, better subscription supplies the plan). */
  license: LicenseLike["organization"] | null;
  /** Publishing requires an entitled subscription (or trial). */
  canPublish: boolean;
  limits: Limits;
  features: PlanFeatures;
  accessTiers: AccessTier[];
};

function tiersOf(plan: PlanLike | null): AccessTier[] {
  if (!plan) return ["basic"];
  return plan.accessTiers.filter((tier): tier is AccessTier => accessTierSchema.safeParse(tier).success);
}

function limitsOf(plan: PlanLike): Limits {
  return {
    maxSites: plan.maxSites,
    maxPagesPerSite: plan.maxPagesPerSite,
    maxProjects: plan.maxProjects,
    storageMb: plan.storageMb,
  };
}

export function parseFeatures(value: unknown): PlanFeatures {
  const parsed = planFeaturesSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : NO_FEATURES;
}

/**
 * Without an entitled subscription or license seat a user can still build a site within the limits of
 * the entry plan (`fallbackPlan`, the first active plan), but cannot publish and gets no paid features.
 * With both, the better plan (higher pricing position) applies; a license that lets members buy domains
 * adds the domain features to whichever plan applies (the member pays for the domain itself).
 */
export function buildEntitlements(
  subscription: SubscriptionLike | null,
  fallbackPlan: PlanLike | null,
  license: LicenseLike | null = null,
): Entitlements {
  const entitledSubscription =
    subscription && ENTITLED_STATUSES.includes(subscription.status) ? subscription : null;
  const useLicense =
    license !== null &&
    (!entitledSubscription || (license.plan.position ?? 0) > (entitledSubscription.plan.position ?? 0));
  const domainFeatures = license?.organization.membersCanBuyDomains
    ? { customDomain: true, domainPurchase: true }
    : {};

  if (entitledSubscription && !useLicense) {
    const { plan, ...rest } = entitledSubscription;
    return {
      plan: { id: plan.id, slug: plan.slug, name: plan.name },
      source: "subscription",
      subscription: rest,
      license: license?.organization ?? null,
      canPublish: true,
      limits: limitsOf(plan),
      features: { ...parseFeatures(plan.features), ...domainFeatures },
      accessTiers: tiersOf(plan),
    };
  }
  if (license) {
    const { plan } = license;
    return {
      plan: { id: plan.id, slug: plan.slug, name: plan.name },
      source: "license",
      subscription: null,
      license: license.organization,
      canPublish: true,
      limits: limitsOf(plan),
      features: { ...parseFeatures(plan.features), ...domainFeatures },
      accessTiers: tiersOf(plan),
    };
  }
  return {
    plan: null,
    source: null,
    subscription: null,
    license: null,
    canPublish: false,
    limits: fallbackPlan ? limitsOf(fallbackPlan) : FALLBACK_LIMITS,
    features: NO_FEATURES,
    accessTiers: tiersOf(fallbackPlan),
  };
}

export function can(entitlements: Entitlements, feature: PlanFeature): boolean {
  return entitlements.features[feature];
}

export function canUseTier(entitlements: Entitlements, tier: string): boolean {
  return entitlements.accessTiers.includes(tier as AccessTier);
}

export type BlockTiers = Record<BlockType, AccessTier>;

export function canUseBlock(entitlements: Entitlements, blockType: string, tiers: BlockTiers): boolean {
  const tier = tiers[blockType as BlockType];
  return tier !== undefined && canUseTier(entitlements, tier);
}

export function lockedBlocks(entitlements: Entitlements, tiers: BlockTiers): BlockType[] {
  return BLOCK_TYPES.filter((type) => !canUseBlock(entitlements, type, tiers));
}

/**
 * Template access: an explicit override (for the user or their plan) always grants it; otherwise the
 * plan must include the template's tier and premium templates must also be purchased.
 */
export function canUseTemplate(
  entitlements: Entitlements,
  template: {
    accessTier: string;
    isPremium?: boolean;
    overrides?: { planId?: string | null; userId?: string | null }[];
  },
  userId?: string,
  purchased = false,
): boolean {
  const overridden = (template.overrides ?? []).some(
    (o) => (o.userId && o.userId === userId) || (o.planId && o.planId === entitlements.plan?.id),
  );
  if (overridden) return true;
  return canUseTier(entitlements, template.accessTier) && (!template.isPremium || purchased);
}

/** Highest tier among the blocks used in the given contents (what a template using them must require). */
export function requiredTierForContent(contents: unknown[], tiers: BlockTiers): AccessTier {
  let max = 0;
  for (const content of contents) {
    walkBlocks(content, (block) => {
      const tier = tiers[block.type as BlockType];
      if (tier) max = Math.max(max, ACCESS_TIERS.indexOf(tier));
    });
  }
  return ACCESS_TIERS[max]!;
}

/** True when tier `a` includes everything tier `b` does (basic < pro < business). */
export function tierCovers(a: string, b: string): boolean {
  return (
    ACCESS_TIERS.indexOf(a as AccessTier) >= ACCESS_TIERS.indexOf(b as AccessTier) &&
    ACCESS_TIERS.includes(a as AccessTier)
  );
}

/** True when one more item fits under the limit (null = unlimited). */
export function canAddMore(limit: number | null, current: number): boolean {
  return limit === null || current < limit;
}

/** Portfolio projects on a page: Project blocks plus ProjectList items. */
export function countProjects(content: unknown): number {
  let count = 0;
  walkBlocks(content, (block) => {
    if (block.type === "Project") count += 1;
    if (block.type === "ProjectList" && Array.isArray(block.props.items)) count += block.props.items.length;
  });
  return count;
}

/**
 * Blocks in `next` that the plan doesn't allow and that weren't already present (by id) in any of
 * `previous`. Existing blocks survive a downgrade; only adding new locked blocks is refused.
 */
export function newDisallowedBlocks(
  next: unknown,
  previous: unknown[],
  entitlements: Entitlements,
  tiers: BlockTiers,
): string[] {
  const existing = new Set<string>();
  for (const content of previous) {
    walkBlocks(content, (block) => typeof block.props.id === "string" && existing.add(block.props.id));
  }
  const disallowed = new Set<string>();
  walkBlocks(next, (block) => {
    if (canUseBlock(entitlements, block.type, tiers)) return;
    if (typeof block.props.id === "string" && existing.has(block.props.id)) return;
    disallowed.add(block.type);
  });
  return [...disallowed];
}
