import {
  DomainOrderStatus,
  LicenseSource,
  LicenseStatus,
  SponsorRemovalStatus,
  SubscriptionStatus,
} from "@/generated/prisma/enums";
import { defaultLocale, isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import type { DomainRegistrar, HostnameProvider } from "@/server/domains/providers";
import { ERASED_EMAIL_DOMAIN, type Mailer } from "@/server/mail";
import { buildLinkMail } from "@/server/mail/templates";
import type { PaymentProvider } from "@/server/payments";
import { hostTag, siteTag } from "@/server/sites/cache-tags";
import { siteSubdomainHostname } from "@/server/sites/urls";
import type { StorageProvider } from "@/server/storage";

/**
 * Account deletion (RODO, owner decisions): a request hides the client's sites at once and stops renewals;
 * after a 14-day grace period (cancellable) the worker erases the account. Plan and domain subscriptions are
 * cancelled without a refund; purchased domains stay registered until expiry and the client gets their
 * transfer codes. Invoices and payments stay (5-year tax retention) with the buyer snapshot inside each
 * invoice; the user row stays anonymized so they keep their reference. Not owner-scoped beyond `userId`;
 * worker-safe (no `server-only` imports), side effects are injected.
 */

export const DELETION_GRACE_DAYS = 14;

export type AccountDeps = {
  payments: PaymentProvider;
  hostnames: HostnameProvider;
  registrar: DomainRegistrar;
  storage: StorageProvider;
  mailer: Mailer;
  invalidate: (tags: string[]) => Promise<void> | void;
  brand: string;
  /** Absolute URL of the account page (links in emails). */
  accountUrl: string;
  now?: () => Date;
};

export class AccountError extends Error {
  constructor(readonly code: "notFound" | "alreadyScheduled" | "notScheduled" | "staffAccount") {
    super(`Account operation failed: ${code}`);
    this.name = "AccountError";
  }
}

const ENTITLED = [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE];

async function siteTagsOf(userId: string): Promise<string[]> {
  const sites = await db.site.findMany({
    where: { ownerId: userId },
    select: { id: true, slug: true, domains: { select: { hostname: true } } },
  });
  return sites.flatMap((site) => [
    siteTag(site.id),
    hostTag(siteSubdomainHostname(site.slug)),
    ...site.domains.map((domain) => hostTag(domain.hostname)),
  ]);
}

function localeOf(value: string) {
  return isLocale(value) ? value : defaultLocale;
}

/** Group licenses the user pays for and their monthly sponsor footer removal (provider subscriptions). */
async function addonSubscriptions(userId: string): Promise<string[]> {
  const [organizations, removal] = await Promise.all([
    db.organization.findMany({
      where: {
        managerId: userId,
        source: LicenseSource.STRIPE,
        providerSubscriptionId: { not: null },
        status: { in: [LicenseStatus.ACTIVE, LicenseStatus.PAST_DUE] },
      },
      select: { providerSubscriptionId: true },
    }),
    db.sponsorRemoval.findFirst({
      where: { userId, status: SponsorRemovalStatus.ACTIVE, providerSubscriptionId: { not: null } },
      select: { providerSubscriptionId: true },
    }),
  ]);
  return [
    ...organizations.map((o) => o.providerSubscriptionId!),
    ...(removal ? [removal.providerSubscriptionId!] : []),
  ];
}

export async function requestAccountDeletion(userId: string, deps: AccountDeps): Promise<Date> {
  const now = deps.now?.() ?? new Date();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new AccountError("notFound");
  if (user.role !== "CLIENT") throw new AccountError("staffAccount");
  if (user.deletionScheduledAt) throw new AccountError("alreadyScheduled");
  const scheduledAt = new Date(now.getTime() + DELETION_GRACE_DAYS * 86_400_000);

  // Stop renewals now (reversible by the client in Billing while the request can still be cancelled).
  const [subscriptions, orders] = await Promise.all([
    db.subscription.findMany({
      where: {
        userId,
        status: { in: ENTITLED },
        providerSubscriptionId: { not: null },
        cancelAtPeriodEnd: false,
      },
    }),
    db.domainOrder.findMany({
      where: {
        userId,
        status: DomainOrderStatus.ACTIVE,
        autoRenew: true,
        providerSubscriptionId: { not: null },
      },
    }),
  ]);
  for (const subscription of subscriptions) {
    await deps.payments.setCancelAtPeriodEnd({
      subscriptionId: subscription.providerSubscriptionId!,
      cancel: true,
    });
  }
  for (const order of orders) {
    await deps.payments.setCancelAtPeriodEnd({ subscriptionId: order.providerSubscriptionId!, cancel: true });
    await db.domainOrder.update({ where: { id: order.id }, data: { autoRenew: false } });
  }
  for (const subscriptionId of await addonSubscriptions(userId)) {
    await deps.payments.setCancelAtPeriodEnd({ subscriptionId, cancel: true });
  }

  await db.user.update({ where: { id: userId }, data: { deletionScheduledAt: scheduledAt } });
  await deps.invalidate(await siteTagsOf(userId));
  await deps.mailer.send(
    await buildLinkMail({
      kind: "accountDeletionScheduled",
      to: user.email,
      url: deps.accountUrl,
      locale: localeOf(user.locale),
      brand: deps.brand,
      values: { days: DELETION_GRACE_DAYS },
    }),
  );
  return scheduledAt;
}

export async function cancelAccountDeletion(
  userId: string,
  deps: Pick<AccountDeps, "invalidate">,
): Promise<void> {
  const { count } = await db.user.updateMany({
    where: { id: userId, deletionScheduledAt: { not: null }, deletedAt: null },
    data: { deletionScheduledAt: null },
  });
  if (!count) throw new AccountError("notScheduled");
  await deps.invalidate(await siteTagsOf(userId));
}

/** Worker, hourly: erases accounts whose grace period is over. Returns the number erased. */
export async function eraseDueAccounts(deps: AccountDeps): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const due = await db.user.findMany({
    where: { deletionScheduledAt: { lte: now }, deletedAt: null },
    select: { id: true },
    take: 20,
  });
  let erased = 0;
  for (const { id } of due) {
    try {
      await eraseAccount(id, deps);
      erased++;
    } catch (error) {
      // Retried on the next run; nothing is anonymized before the provider steps succeed.
      console.error(`[account] erasure of ${id} failed`, error);
    }
  }
  return erased;
}

export async function eraseAccount(userId: string, deps: AccountDeps): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      subscriptions: {
        where: { status: { not: SubscriptionStatus.CANCELED }, providerSubscriptionId: { not: null } },
      },
      domainOrders: { where: { status: DomainOrderStatus.ACTIVE } },
      sites: { select: { id: true, domains: { select: { providerHostnameId: true } } } },
      assets: { select: { key: true } },
    },
  });
  if (!user || user.deletedAt) return;
  const tags = await siteTagsOf(userId);

  // 1. Provider side first: nothing may keep charging an erased account.
  for (const subscription of user.subscriptions) {
    await deps.payments.cancelSubscription({ subscriptionId: subscription.providerSubscriptionId! });
  }
  for (const subscriptionId of await addonSubscriptions(userId)) {
    await deps.payments.cancelSubscription({ subscriptionId });
  }
  const transferCodes: string[] = [];
  for (const order of user.domainOrders) {
    if (order.providerSubscriptionId) {
      await deps.payments.cancelSubscription({ subscriptionId: order.providerSubscriptionId });
    }
    let code = "—";
    if (order.registrarDomainId) {
      try {
        code = await deps.registrar.getAuthCode(order.registrarDomainId);
      } catch (error) {
        console.error(`[account] auth code for ${order.domainName} failed`, error);
      }
    }
    transferCodes.push(
      `${order.domainName}: ${code}${order.expiresAt ? ` (${order.expiresAt.toISOString().slice(0, 10)})` : ""}`,
    );
  }
  for (const site of user.sites) {
    for (const domain of site.domains) {
      if (!domain.providerHostnameId) continue;
      await deps.hostnames.delete(domain.providerHostnameId).catch((error: unknown) => {
        console.error("[account] custom hostname removal failed", error);
      });
    }
  }
  if (user.assets.length) {
    await deps.storage.delete(
      user.assets.flatMap((asset) => [asset.key, asset.key.replace(/\.webp$/, "-thumb.webp")]),
    );
  }

  // 2. The final mail goes to the real address before it is anonymized.
  await deps.mailer.send(
    await buildLinkMail({
      kind: "accountDeleted",
      to: user.email,
      url: deps.accountUrl.replace(/\/account$/, "/"),
      locale: localeOf(user.locale),
      brand: deps.brand,
      ...(transferCodes.length ? { quote: transferCodes.join("\n") } : {}),
    }),
  );

  // 3. Personal data: delete what belongs to the client, anonymize the row invoices refer to.
  const email = user.email;
  await db.$transaction([
    db.site.deleteMany({ where: { ownerId: userId } }),
    db.asset.deleteMany({ where: { ownerId: userId } }),
    db.account.deleteMany({ where: { userId } }),
    db.session.deleteMany({ where: { userId } }),
    db.billingProfile.deleteMany({ where: { userId } }),
    db.clientNote.deleteMany({ where: { userId } }),
    db.templateOverride.deleteMany({ where: { userId } }),
    db.verificationToken.deleteMany({ where: { identifier: { endsWith: email } } }),
    db.domainOrder.updateMany({ where: { userId }, data: { registrant: {}, autoRenew: false } }),
    db.organizationMember.deleteMany({ where: { userId } }),
    db.organizationInvite.deleteMany({ where: { email } }),
    db.organization.updateMany({ where: { managerId: userId }, data: { managerId: null } }),
    db.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@${ERASED_EMAIL_DOMAIN}`,
        name: null,
        image: null,
        passwordHash: null,
        emailVerified: null,
        termsVersion: null,
        blockedAt: now,
        deletedAt: now,
        deletionScheduledAt: null,
      },
    }),
    db.auditLog.create({ data: { action: "account.erased", targetType: "user", targetId: userId } }),
  ]);
  await deps.invalidate(tags);
}
