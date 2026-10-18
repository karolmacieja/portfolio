import { describe, expect, it } from "vitest";

import { block } from "@/blocks/content";

import {
  buildEntitlements,
  can,
  canAddMore,
  canUseBlock,
  canUseTemplate,
  countProjects,
  DEFAULT_BLOCK_TIERS,
  FALLBACK_LIMITS,
  lockedBlocks,
  newDisallowedBlocks,
  requiredTierForContent,
  tierCovers,
  type PlanLike,
  type SubscriptionLike,
} from "./rules";

const plan = (
  slug: string,
  tiers: string[],
  features: object = {},
  maxProjects: number | null = 30,
): PlanLike => ({
  id: `plan-${slug}`,
  slug,
  name: slug,
  maxSites: slug === "start" ? 1 : 3,
  maxPagesPerSite: 5,
  maxProjects,
  storageMb: 500,
  features,
  accessTiers: tiers,
});

const start = plan("start", ["basic"]);
const pro = plan("pro", ["basic", "pro"], { customDomain: true, removeBranding: true }, null);

const subscription = (status: SubscriptionLike["status"], p: PlanLike = pro): SubscriptionLike => ({
  status,
  trialEndsAt: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  plan: p,
});

describe("buildEntitlements", () => {
  it("grants the subscribed plan for active, trialing and past-due subscriptions", () => {
    for (const status of ["ACTIVE", "TRIALING", "PAST_DUE"] as const) {
      const e = buildEntitlements(subscription(status), start);
      expect(e.plan?.slug).toBe("pro");
      expect(e.canPublish).toBe(true);
      expect(e.accessTiers).toEqual(["basic", "pro"]);
      expect(can(e, "removeBranding")).toBe(true);
      expect(e.limits.maxProjects).toBeNull();
    }
  });

  it("without an entitled subscription: entry plan limits, no publishing, no paid features", () => {
    for (const sub of [null, subscription("CANCELED"), subscription("UNPAID"), subscription("INCOMPLETE")]) {
      const e = buildEntitlements(sub, start);
      expect(e.plan).toBeNull();
      expect(e.canPublish).toBe(false);
      expect(e.limits.maxSites).toBe(1);
      expect(e.accessTiers).toEqual(["basic"]);
      expect(can(e, "customDomain")).toBe(false);
    }
  });

  it("falls back to built-in limits when there are no plans at all", () => {
    expect(buildEntitlements(null, null).limits).toEqual(FALLBACK_LIMITS);
  });

  it("ignores unknown tiers and malformed feature flags", () => {
    const e = buildEntitlements(
      subscription("ACTIVE", plan("x", ["basic", "gold"], { removeBranding: "yes" })),
      null,
    );
    expect(e.accessTiers).toEqual(["basic"]);
    expect(can(e, "removeBranding")).toBe(false);
  });
});

describe("block and template access", () => {
  const startE = buildEntitlements(subscription("ACTIVE", start), null);
  const proE = buildEntitlements(subscription("ACTIVE"), null);

  it("locks blocks above the plan's tiers", () => {
    expect(canUseBlock(startE, "Hero", DEFAULT_BLOCK_TIERS)).toBe(true);
    expect(canUseBlock(startE, "Video", DEFAULT_BLOCK_TIERS)).toBe(false);
    expect(canUseBlock(proE, "Video", DEFAULT_BLOCK_TIERS)).toBe(true);
    expect(canUseBlock(proE, "Unknown", DEFAULT_BLOCK_TIERS)).toBe(false);
    expect(lockedBlocks(startE, DEFAULT_BLOCK_TIERS)).toEqual([
      "Timeline",
      "Testimonials",
      "Video",
      "Section",
      "Pricing",
      "Faq",
      "Stats",
      "Logos",
      "FileDownload",
      "Columns",
    ]);
    // Simple content blocks are available on the entry plan.
    for (const type of ["Heading", "Buttons", "Quote", "Divider", "IconList"]) {
      expect(canUseBlock(startE, type, DEFAULT_BLOCK_TIERS)).toBe(true);
    }
    expect(lockedBlocks(proE, DEFAULT_BLOCK_TIERS)).toEqual([]);
  });

  it("allows templates by tier or explicit override", () => {
    expect(canUseTemplate(startE, { accessTier: "pro" })).toBe(false);
    expect(canUseTemplate(proE, { accessTier: "pro" })).toBe(true);
    expect(canUseTemplate(startE, { accessTier: "pro", overrides: [{ planId: "plan-start" }] })).toBe(true);
    expect(canUseTemplate(startE, { accessTier: "pro", overrides: [{ userId: "u1" }] }, "u1")).toBe(true);
    expect(canUseTemplate(startE, { accessTier: "pro", overrides: [{ userId: "u1" }] }, "u2")).toBe(false);
  });

  it("requires a purchase for premium templates unless overridden", () => {
    expect(canUseTemplate(proE, { accessTier: "basic", isPremium: true })).toBe(false);
    expect(canUseTemplate(proE, { accessTier: "basic", isPremium: true }, "u1", true)).toBe(true);
    expect(canUseTemplate(startE, { accessTier: "pro", isPremium: true }, "u1", true)).toBe(false);
    expect(
      canUseTemplate(proE, { accessTier: "basic", isPremium: true, overrides: [{ userId: "u1" }] }, "u1"),
    ).toBe(true);
  });

  it("computes the tier a template's content requires", () => {
    expect(requiredTierForContent([{ content: [block("Hero")] }], DEFAULT_BLOCK_TIERS)).toBe("basic");
    expect(
      requiredTierForContent(
        [{ content: [block("Hero")] }, { content: [block("Columns", { col1: [block("Video")] })] }],
        DEFAULT_BLOCK_TIERS,
      ),
    ).toBe("pro");
    expect(tierCovers("pro", "basic")).toBe(true);
    expect(tierCovers("basic", "pro")).toBe(false);
    expect(tierCovers("gold", "basic")).toBe(false);
  });

  it("refuses only newly added locked blocks (downgrade keeps existing ones)", () => {
    const video = block("Video", { url: "https://youtu.be/dQw4w9WgXcQ" });
    const before = { root: {}, content: [video] };
    const after = { root: {}, content: [video, block("Text", { text: "x" })] };
    expect(newDisallowedBlocks(after, [before], startE, DEFAULT_BLOCK_TIERS)).toEqual([]);

    const added = { root: {}, content: [video, block("Testimonials")] };
    expect(newDisallowedBlocks(added, [before], startE, DEFAULT_BLOCK_TIERS)).toEqual(["Testimonials"]);

    const nested = { root: {}, content: [block("Columns", { col1: [block("Video")] })] };
    expect(newDisallowedBlocks(nested, [], startE, DEFAULT_BLOCK_TIERS).sort()).toEqual(["Columns", "Video"]);
    expect(newDisallowedBlocks(nested, [], proE, DEFAULT_BLOCK_TIERS)).toEqual([]);
  });
});

describe("limits", () => {
  it("canAddMore treats null as unlimited", () => {
    expect(canAddMore(1, 0)).toBe(true);
    expect(canAddMore(1, 1)).toBe(false);
    expect(canAddMore(null, 10_000)).toBe(true);
  });

  it("counts projects across blocks and nested columns", () => {
    const content = {
      root: {},
      content: [
        block("Project"),
        block("ProjectList", { items: [{}, {}, {}] as never }),
        block("Columns", { col1: [block("Project")] }),
        block("Text"),
      ],
    };
    expect(countProjects(content)).toBe(5);
    expect(countProjects(null)).toBe(0);
  });
});

describe("group licenses", () => {
  const orgPlan = { ...pro, position: 1 };
  const license = (membersCanBuyDomains = false) => ({
    organization: { id: "org-1", name: "Szkoła", membersCanBuyDomains },
    plan: orgPlan,
  });
  const sub = (p: PlanLike): SubscriptionLike => ({
    status: "ACTIVE",
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    plan: p,
  });

  it("grants the license plan to members without their own subscription", () => {
    const e = buildEntitlements(null, start, license());
    expect(e).toMatchObject({ source: "license", canPublish: true, plan: { slug: "pro" } });
    expect(e.license?.name).toBe("Szkoła");
  });

  it("uses the better plan when the member also pays for one", () => {
    const business = { ...plan("business", ["basic", "pro", "business"]), position: 2 };
    expect(buildEntitlements(sub(business), start, license())).toMatchObject({
      source: "subscription",
      plan: { slug: "business" },
      license: { id: "org-1" },
    });
    expect(buildEntitlements(sub({ ...start, position: 0 }), start, license()).source).toBe("license");
  });

  it("adds domain features when the organization allows members to buy domains", () => {
    const basic = { ...start, position: 1 };
    const withDomains = buildEntitlements(null, start, { ...license(true), plan: basic });
    expect(can(withDomains, "domainPurchase")).toBe(true);
    expect(can(withDomains, "customDomain")).toBe(true);
    expect(can(buildEntitlements(null, start, { ...license(false), plan: basic }), "domainPurchase")).toBe(
      false,
    );
  });
});
