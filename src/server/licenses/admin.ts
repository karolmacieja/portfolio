import "server-only";

import { randomBytes } from "node:crypto";

import { LicenseSource, LicenseStatus, OrganizationRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { nextBillingDeps } from "@/server/billing/provider";
import { allSiteTags, restoreSitesAfterPayment, suspendSitesForPayment } from "@/server/billing/sites";
import { getEntitlements, isLicenseActive } from "@/server/entitlements";
import { invalidateTags } from "@/server/sites/invalidate";

import { applyLicenseStatus, memberSiteTags } from "./billing";
import { LicenseError } from "./errors";

/**
 * Staff management of group licenses (not owner-scoped by design; permission `licenses.manage`): manual
 * licenses for agreed deals, sponsor footer switches (whole license or one member), seats and members.
 */

export function listOrganizations() {
  return db.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      plan: { select: { name: true } },
      manager: { select: { email: true } },
      _count: { select: { members: true } },
    },
  });
}

export async function getOrganizationAdmin(id: string) {
  const org = await db.organization.findUnique({
    where: { id },
    include: {
      plan: true,
      manager: { select: { id: true, email: true } },
      members: {
        orderBy: { joinedAt: "asc" },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              sponsorRemoval: { select: { status: true, mode: true } },
            },
          },
        },
      },
      invites: { where: { acceptedAt: null }, orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!org) throw new LicenseError("notFound");
  return org;
}

async function findFreeUser(email: string) {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { membership: true },
  });
  if (!user || user.deletedAt) throw new LicenseError("managerNotFound");
  if (user.membership) throw new LicenseError("alreadyMember");
  return user;
}

export type ManualLicenseInput = {
  name: string;
  planId: string;
  seats: number;
  validUntil: Date | null;
  note: string | null;
  managerEmail: string;
  sponsorName: string | null;
  sponsorUrl: string | null;
  membersCanBuyDomains: boolean;
};

/** A license for an agreed price (invoiced outside the payment provider); the manager needs an account. */
export async function createManualLicense(input: ManualLicenseInput) {
  const manager = await findFreeUser(input.managerEmail);
  const org = await db.organization.create({
    data: {
      name: input.name,
      planId: input.planId,
      seats: input.seats,
      source: LicenseSource.MANUAL,
      status: LicenseStatus.ACTIVE,
      validUntil: input.validUntil,
      note: input.note,
      managerId: manager.id,
      sponsorName: input.sponsorName,
      sponsorUrl: input.sponsorUrl,
      membersCanBuyDomains: input.membersCanBuyDomains,
      joinCode: randomBytes(9).toString("base64url"),
      members: { create: { userId: manager.id, role: OrganizationRole.MANAGER } },
    },
  });
  await invalidateTags([...(await allSiteTags(manager.id)), ...(await restoreSitesAfterPayment(manager.id))]);
  return org;
}

export type OrganizationAdminInput = {
  name: string;
  planId: string;
  seats: number;
  validUntil: Date | null;
  note: string | null;
  sponsorName: string | null;
  sponsorUrl: string | null;
  sponsorFooter: boolean;
  membersCanBuyDomains: boolean;
  /** Manual licenses only: switch on/off (self-service ones follow the provider). */
  status: LicenseStatus | null;
};

export async function updateOrganizationAdmin(id: string, input: OrganizationAdminInput) {
  const org = await db.organization.findUnique({
    where: { id },
    include: { _count: { select: { members: true } } },
  });
  if (!org) throw new LicenseError("notFound");
  if (input.seats < org._count.members) throw new LicenseError("seatsBelowMembers");
  const manual = org.source === LicenseSource.MANUAL;
  // Self-service seats and plan are what the client pays for: they change at the provider, not here.
  const updated = await db.organization.update({
    where: { id },
    data: {
      name: input.name,
      note: input.note,
      sponsorName: input.sponsorName,
      sponsorUrl: input.sponsorUrl,
      sponsorFooter: input.sponsorFooter,
      membersCanBuyDomains: input.membersCanBuyDomains,
      ...(manual
        ? {
            planId: input.planId,
            seats: input.seats,
            validUntil: input.validUntil,
            ...(input.status ? { status: input.status } : {}),
          }
        : {}),
    },
  });
  const wasActive = isLicenseActive(org);
  const isActive = isLicenseActive(updated);
  if (wasActive !== isActive) await applyLicenseStatus(id, isActive, nextBillingDeps());
  else await invalidateTags(await memberSiteTags(id));
  return updated;
}

/** Staff switch for one member's sponsor footer (e.g. a free exception). */
export async function setMemberSponsorHidden(organizationId: string, userId: string, hidden: boolean) {
  const { count } = await db.organizationMember.updateMany({
    where: { organizationId, userId },
    data: { sponsorFooterHidden: hidden },
  });
  if (!count) throw new LicenseError("notFound");
  await invalidateTags(await allSiteTags(userId));
}

export async function addMemberAdmin(organizationId: string, email: string) {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    include: { _count: { select: { members: true } } },
  });
  if (!org) throw new LicenseError("notFound");
  if (org._count.members >= org.seats) throw new LicenseError("noSeats");
  const user = await findFreeUser(email);
  await db.organizationMember.create({ data: { organizationId, userId: user.id } });
  await invalidateTags([...(await allSiteTags(user.id)), ...(await restoreSitesAfterPayment(user.id))]);
}

export async function removeMemberAdmin(organizationId: string, userId: string) {
  const member = await db.organizationMember.findUnique({ where: { userId } });
  if (!member || member.organizationId !== organizationId) throw new LicenseError("notFound");
  if (member.role === OrganizationRole.MANAGER) throw new LicenseError("managerCannotLeave");
  await db.organizationMember.delete({ where: { id: member.id } });
  const tags = await allSiteTags(userId);
  if (!(await getEntitlements(userId)).canPublish) tags.push(...(await suspendSitesForPayment(userId)));
  await invalidateTags(tags);
}
