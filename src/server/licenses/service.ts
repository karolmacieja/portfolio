import "server-only";

import { createHash, randomBytes } from "node:crypto";

import {
  BillingInterval,
  LicenseSource,
  LicenseStatus,
  OrganizationRole,
  SponsorRemovalMode,
  SponsorRemovalStatus,
} from "@/generated/prisma/enums";
import { defaultLocale, isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { getEnv, platformUrl } from "@/lib/env";
import { BillingError } from "@/server/billing/errors";
import { getPaymentProvider, nextBillingDeps } from "@/server/billing/provider";
import { purchaser } from "@/server/billing/service";
import { allSiteTags, restoreSitesAfterPayment, suspendSitesForPayment } from "@/server/billing/sites";
import { getEntitlements, isLicenseActive } from "@/server/entitlements";
import { getMailer } from "@/server/mail";
import { buildLinkMail } from "@/server/mail/templates";
import { invalidateTags } from "@/server/sites/invalidate";

import { applyLicenseStatus, memberSiteTags } from "./billing";
import { LicenseError } from "./errors";
import { getSponsorSettings } from "./settings";

/**
 * Group licenses for clients (owner-scoped through the caller's membership): buying seats, managing the
 * organization (manager), joining with a link or an e-mail invitation, leaving, and the paid sponsor footer
 * removal. Payments are confirmed by provider events (licenses/billing.ts), never here.
 */

export const MIN_SEATS = 2;
export const MAX_SEATS = 1000;
const INVITE_TTL_MS = 14 * 86_400_000;

const newJoinCode = () => randomBytes(9).toString("base64url");
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function purchaserFor(userId: string) {
  try {
    return await purchaser(userId);
  } catch (error) {
    if (
      error instanceof BillingError &&
      (error.code === "emailNotVerified" || error.code === "billingProfileRequired")
    )
      throw new LicenseError(error.code);
    throw error;
  }
}

/** The caller's organization (with plan and counts) and role, or null. */
export async function getMembership(userId: string) {
  const member = await db.organizationMember.findUnique({
    where: { userId },
    include: {
      organization: {
        include: {
          plan: { select: { id: true, name: true, slug: true } },
          _count: { select: { members: true } },
        },
      },
    },
  });
  if (!member) return null;
  return { ...member, active: isLicenseActive(member.organization) };
}

async function managedOrganization(userId: string) {
  const member = await db.organizationMember.findUnique({
    where: { userId },
    include: { organization: true },
  });
  if (!member || member.role !== OrganizationRole.MANAGER) throw new LicenseError("notManager");
  return member.organization;
}

/** Plans offered for self-service licenses (with seat prices). */
export async function listLicensePlans() {
  return db.plan.findMany({
    where: { isActive: true, OR: [{ seatPriceMonthly: { not: null } }, { seatPriceYearly: { not: null } }] },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function startLicensePurchase(
  userId: string,
  input: {
    name: string;
    planId: string;
    seats: number;
    interval: BillingInterval;
    sponsorName: string | null;
    sponsorUrl: string | null;
  },
): Promise<string> {
  const plan = await db.plan.findFirst({ where: { id: input.planId, isActive: true } });
  const seatPrice = input.interval === BillingInterval.YEAR ? plan?.seatPriceYearly : plan?.seatPriceMonthly;
  if (!plan || !seatPrice) throw new LicenseError("planNotOffered");
  const existing = await db.organizationMember.findUnique({
    where: { userId },
    include: { organization: true },
  });
  if (existing) {
    // An abandoned checkout of the caller's own license may be replaced; any other membership blocks.
    if (
      existing.role !== OrganizationRole.MANAGER ||
      existing.organization.status !== LicenseStatus.PENDING_PAYMENT
    )
      throw new LicenseError("alreadyMember");
    await db.organization.delete({ where: { id: existing.organizationId } });
  }
  const { customerId } = await purchaserFor(userId);
  const organization = await db.organization.create({
    data: {
      name: input.name,
      planId: plan.id,
      seats: input.seats,
      source: LicenseSource.STRIPE,
      status: LicenseStatus.PENDING_PAYMENT,
      interval: input.interval,
      seatPrice,
      managerId: userId,
      sponsorName: input.sponsorName,
      sponsorUrl: input.sponsorUrl,
      joinCode: newJoinCode(),
      members: { create: { userId, role: OrganizationRole.MANAGER } },
    },
  });
  const checkout = await getPaymentProvider().createInlineSubscriptionCheckout({
    customerId,
    amount: seatPrice,
    currency: "PLN",
    quantity: input.seats,
    interval: input.interval,
    name: `Licencja grupowa ${plan.name} (${input.name})`,
    successUrl: platformUrl("app", "/organization?purchased=1"),
    cancelUrl: platformUrl("app", "/licenses"),
    metadata: { kind: "license", userId, organizationId: organization.id },
  });
  return checkout.url;
}

export async function updateOrganization(
  userId: string,
  input: { name: string; sponsorName: string | null; sponsorUrl: string | null; joinLinkEnabled: boolean },
) {
  const org = await managedOrganization(userId);
  await db.organization.update({ where: { id: org.id }, data: input });
  await invalidateTags(await memberSiteTags(org.id));
}

export async function regenerateJoinCode(userId: string) {
  const org = await managedOrganization(userId);
  await db.organization.update({ where: { id: org.id }, data: { joinCode: newJoinCode() } });
}

/** Sends invitations (re-sending replaces older links of the same address). Returns how many were sent. */
export async function inviteMembers(userId: string, emails: string[]): Promise<number> {
  const org = await managedOrganization(userId);
  if (!isLicenseActive(org)) throw new LicenseError("licenseInactive");
  const inviter = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, email: true },
  });
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const members = await db.organizationMember.count({ where: { organizationId: org.id } });
  if (members + unique.length > org.seats) throw new LicenseError("noSeats");
  for (const email of unique) {
    const token = randomBytes(24).toString("base64url");
    await db.organizationInvite.upsert({
      where: { organizationId_email: { organizationId: org.id, email } },
      update: {
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        acceptedAt: null,
      },
      create: {
        organizationId: org.id,
        email,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    const existing = await db.user.findUnique({ where: { email }, select: { locale: true } });
    try {
      await getMailer().send(
        await buildLinkMail({
          kind: "licenseInvite",
          to: email,
          url: platformUrl("app", `/join?invite=${encodeURIComponent(token)}`),
          locale: existing && isLocale(existing.locale) ? existing.locale : defaultLocale,
          brand: getEnv().BRAND_NAME,
          values: { domain: org.name, name: inviter.name ?? inviter.email },
        }),
      );
    } catch (error) {
      console.error("[licenses] invitation mail failed", error);
    }
  }
  return unique.length;
}

export async function revokeInvite(userId: string, inviteId: string) {
  const org = await managedOrganization(userId);
  await db.organizationInvite.deleteMany({ where: { id: inviteId, organizationId: org.id } });
}

/** What the join page shows for a link or an invitation (null when it can't be used). */
export async function describeJoin(input: { code?: string; invite?: string }) {
  if (input.invite) {
    const invite = await db.organizationInvite.findUnique({
      where: { tokenHash: hashToken(input.invite) },
      include: { organization: { include: { plan: { select: { name: true } } } } },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return null;
    return { organization: invite.organization, email: invite.email };
  }
  if (input.code) {
    const organization = await db.organization.findUnique({
      where: { joinCode: input.code },
      include: { plan: { select: { name: true } } },
    });
    if (!organization?.joinLinkEnabled) return null;
    return { organization, email: null };
  }
  return null;
}

/** Joins an organization through its link or a personal invitation; returns cache tags to invalidate. */
export async function joinOrganization(userId: string, input: { code?: string; invite?: string }) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  let organizationId: string;
  let inviteId: string | null = null;
  if (input.invite) {
    const invite = await db.organizationInvite.findUnique({ where: { tokenHash: hashToken(input.invite) } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date())
      throw new LicenseError("inviteInvalid");
    if (invite.email !== user.email.toLowerCase()) throw new LicenseError("inviteEmailMismatch");
    organizationId = invite.organizationId;
    inviteId = invite.id;
  } else {
    const org = input.code ? await db.organization.findUnique({ where: { joinCode: input.code } }) : null;
    if (!org) throw new LicenseError("notFound");
    if (!org.joinLinkEnabled) throw new LicenseError("joinLinkDisabled");
    organizationId = org.id;
  }
  if (await db.organizationMember.count({ where: { userId } })) throw new LicenseError("alreadyMember");
  await db.$transaction(async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
    if (!isLicenseActive(org)) throw new LicenseError("licenseInactive");
    // Locks the organization row so concurrent joins can't exceed the seats.
    await tx.$executeRaw`SELECT id FROM "Organization" WHERE id = ${org.id} FOR UPDATE`;
    if ((await tx.organizationMember.count({ where: { organizationId } })) >= org.seats)
      throw new LicenseError("noSeats");
    await tx.organizationMember.create({ data: { organizationId, userId } });
    if (inviteId)
      await tx.organizationInvite.update({ where: { id: inviteId }, data: { acceptedAt: new Date() } });
  });
  await invalidateTags([...(await allSiteTags(userId)), ...(await restoreSitesAfterPayment(userId))]);
}

/** A member leaves (or is removed): sites stay up only if they have their own plan. */
async function releaseMember(userId: string, organizationId: string) {
  await db.organizationMember.deleteMany({ where: { userId, organizationId } });
  const tags = await allSiteTags(userId);
  if (!(await getEntitlements(userId)).canPublish) tags.push(...(await suspendSitesForPayment(userId)));
  await invalidateTags(tags);
}

export async function leaveOrganization(userId: string) {
  const member = await db.organizationMember.findUnique({ where: { userId } });
  if (!member) throw new LicenseError("notFound");
  if (member.role === OrganizationRole.MANAGER) throw new LicenseError("managerCannotLeave");
  await releaseMember(userId, member.organizationId);
}

export async function removeMember(managerId: string, memberUserId: string) {
  const org = await managedOrganization(managerId);
  const member = await db.organizationMember.findUnique({ where: { userId: memberUserId } });
  if (!member || member.organizationId !== org.id) throw new LicenseError("notFound");
  if (member.role === OrganizationRole.MANAGER) throw new LicenseError("managerCannotLeave");
  await releaseMember(memberUserId, org.id);
}

export async function listMembers(managerId: string) {
  const org = await managedOrganization(managerId);
  const [members, invites] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: org.id },
      orderBy: { joinedAt: "asc" },
      include: { user: { select: { id: true, email: true, name: true } } },
    }),
    db.organizationInvite.findMany({
      where: { organizationId: org.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { organization: org, members, invites };
}

/** Self-service licenses: seats change at the provider (prorated); the event stores the new count. */
export async function changeSeats(managerId: string, seats: number) {
  const org = await managedOrganization(managerId);
  if (org.source !== LicenseSource.STRIPE || !org.providerSubscriptionId)
    throw new LicenseError("manualLicense");
  if (seats < (await db.organizationMember.count({ where: { organizationId: org.id } })))
    throw new LicenseError("seatsBelowMembers");
  await getPaymentProvider().setSubscriptionQuantity({
    subscriptionId: org.providerSubscriptionId,
    quantity: seats,
  });
}

export async function setLicenseCancelAtPeriodEnd(managerId: string, cancel: boolean) {
  const org = await managedOrganization(managerId);
  if (org.source !== LicenseSource.STRIPE || !org.providerSubscriptionId)
    throw new LicenseError("manualLicense");
  await getPaymentProvider().setCancelAtPeriodEnd({ subscriptionId: org.providerSubscriptionId, cancel });
}

// --- Sponsor footer removal ------------------------------------------------------------------------

/** Whether the member's sites currently show the sponsor footer, and what removing it costs. */
export async function sponsorStatus(userId: string) {
  const [membership, removal, settings] = await Promise.all([
    db.organizationMember.findUnique({ where: { userId }, include: { organization: true } }),
    db.sponsorRemoval.findUnique({ where: { userId } }),
    getSponsorSettings(),
  ]);
  const org = membership?.organization;
  const footerOn = Boolean(org && org.sponsorFooter && org.sponsorName && !membership.sponsorFooterHidden);
  return {
    footerOn,
    removed: removal?.status === SponsorRemovalStatus.ACTIVE,
    removal,
    settings,
  };
}

export async function startSponsorRemoval(userId: string): Promise<string> {
  const status = await sponsorStatus(userId);
  if (!status.settings.enabled) throw new LicenseError("sponsorRemovalUnavailable");
  if (!status.footerOn) throw new LicenseError("sponsorNotShown");
  if (status.removed) throw new LicenseError("alreadyRemoved");
  const { customerId } = await purchaserFor(userId);
  const { mode, amount } = status.settings;
  await db.sponsorRemoval.upsert({
    where: { userId },
    update: { mode, amount, status: SponsorRemovalStatus.PENDING_PAYMENT, providerSubscriptionId: null },
    create: { userId, mode, amount },
  });
  const provider = getPaymentProvider();
  const common = {
    customerId,
    amount,
    currency: "PLN",
    successUrl: platformUrl("app", "/organization?removed=1"),
    cancelUrl: platformUrl("app", "/organization"),
    metadata: { kind: "sponsor-removal", userId },
  };
  const checkout =
    mode === SponsorRemovalMode.MONTHLY
      ? await provider.createInlineSubscriptionCheckout({
          ...common,
          name: "Usunięcie stopki sponsora (miesięcznie)",
          interval: BillingInterval.MONTH,
          quantity: 1,
        })
      : await provider.createPaymentCheckout({ ...common, name: "Usunięcie stopki sponsora" });
  return checkout.url;
}

/** Monthly removal: ends at the end of the paid month (the footer comes back then). */
export async function cancelSponsorRemoval(userId: string) {
  const removal = await db.sponsorRemoval.findUnique({ where: { userId } });
  if (!removal?.providerSubscriptionId || removal.status !== SponsorRemovalStatus.ACTIVE)
    throw new LicenseError("notFound");
  await getPaymentProvider().setCancelAtPeriodEnd({
    subscriptionId: removal.providerSubscriptionId,
    cancel: true,
  });
}

/** Used by staff tools and tests: applies a license status change with the app's side effects. */
export async function applyLicenseStatusNow(organizationId: string, active: boolean) {
  await applyLicenseStatus(organizationId, active, nextBillingDeps());
}
