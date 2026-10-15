import { isLocale } from "@/i18n/config";
import { DomainStatus, type Domain } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { Env } from "@/lib/env";
import { getBillingSettings } from "@/server/billing/settings";
import { can } from "@/server/entitlements/rules";
import { getEntitlements } from "@/server/entitlements/load";
import type { Mailer } from "@/server/mail";
import { buildLinkMail } from "@/server/mail/templates";
import { hostTag, siteTag } from "@/server/sites/cache-tags";

import { routingRecords } from "./dns";
import type { DnsRecord, HostnameProvider, HostnameState } from "./providers";

/**
 * Domain state shared by the panel (Next.js) and the worker: applying provider verification
 * results, the periodic check, and switching domains off when a plan loses custom domains.
 * Side effects are injected so the same code runs in both processes and in tests.
 */

export type DomainDeps = {
  hostnames: HostnameProvider;
  env: Pick<Env, "CUSTOM_DOMAIN_CNAME_TARGET" | "ROOT_DOMAIN" | "CUSTOM_DOMAIN_APEX_IPS">;
  invalidate: (tags: string[]) => Promise<void> | void;
  mailer: Mailer;
  brand: string;
  /** Absolute URL of the client panel (links in emails). */
  panelUrl: string;
  now?: () => Date;
};

export type DomainMail =
  | "domainActive"
  | "domainsDisabledSoon"
  | "domainsDisabled"
  | "domainRegistered"
  | "domainRenewalReminder"
  | "domainRenewalFailed"
  | "domainExpired";

export async function sendDomainMail(
  deps: Pick<DomainDeps, "mailer" | "brand" | "panelUrl">,
  userId: string,
  kind: DomainMail,
  values: { domain: string; days?: number },
) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, locale: true } });
  if (!user) return;
  try {
    const mail = await buildLinkMail({
      kind,
      to: user.email,
      url: deps.panelUrl,
      locale: isLocale(user.locale) ? user.locale : "pl",
      brand: deps.brand,
      values,
    });
    await deps.mailer.send(mail);
  } catch (error) {
    console.error(`Failed to send ${kind} mail`, error);
  }
}

export const domainTags = (domain: Pick<Domain, "hostname" | "siteId">) => [
  hostTag(domain.hostname),
  siteTag(domain.siteId),
];

/** Records shown to the client: routing (CNAME/A) first, then the provider's verification records. */
export function dnsRecordsFor(
  hostname: string,
  state: HostnameState | null,
  deps: Pick<DomainDeps, "env">,
): DnsRecord[] {
  return [...routingRecords(hostname, deps.env), ...(state?.records ?? [])];
}

/** Stores a provider state; invalidates caches and notifies the owner when the domain goes live. */
export async function applyHostnameState(
  domain: Domain,
  state: HostnameState,
  deps: DomainDeps,
): Promise<Domain> {
  const now = deps.now?.() ?? new Date();
  const becameActive = state.status === "ACTIVE" && domain.status !== DomainStatus.ACTIVE;
  const statusChanged = state.status !== domain.status;
  const updated = await db.domain.update({
    where: { id: domain.id },
    data: {
      status: state.status,
      sslStatus: state.sslStatus,
      providerHostnameId: state.providerId,
      dnsRecords: dnsRecordsFor(domain.hostname, state, deps),
      lastError: state.error,
      checkedAt: now,
      ...(becameActive ? { activatedAt: now } : {}),
    },
  });
  if (statusChanged) await deps.invalidate(domainTags(domain));
  if (becameActive) {
    const site = await db.site.findUnique({ where: { id: domain.siteId }, select: { ownerId: true } });
    if (site) await sendDomainMail(deps, site.ownerId, "domainActive", { domain: domain.hostname });
  }
  return updated;
}

/** How often a domain is checked, by state and age. */
function checkInterval(domain: Pick<Domain, "status" | "createdAt">, now: Date): number {
  if (domain.status === DomainStatus.ACTIVE) return 24 * 60 * 60_000;
  const age = now.getTime() - domain.createdAt.getTime();
  if (age < 60 * 60_000) return 60_000;
  if (age < 24 * 60 * 60_000) return 10 * 60_000;
  return 60 * 60_000;
}

/** Worker: checks pending domains (and re-checks live ones daily). Returns the number checked. */
export async function checkDomains(deps: DomainDeps, limit = 50): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const candidates = await db.domain.findMany({
    where: {
      providerHostnameId: { not: null },
      status: { in: [DomainStatus.PENDING_DNS, DomainStatus.PENDING_SSL, DomainStatus.ACTIVE] },
      OR: [{ checkedAt: null }, { checkedAt: { lt: new Date(now.getTime() - 60_000) } }],
    },
    orderBy: { checkedAt: { sort: "asc", nulls: "first" } },
    take: limit * 4,
  });
  const due = candidates
    .filter((d) => !d.checkedAt || now.getTime() - d.checkedAt.getTime() >= checkInterval(d, now))
    .slice(0, limit);
  for (const domain of due) {
    try {
      await applyHostnameState(domain, await deps.hostnames.get(domain.providerHostnameId!), deps);
    } catch (error) {
      console.error(`[domains] check of ${domain.hostname} failed`, error);
      await db.domain.update({ where: { id: domain.id }, data: { checkedAt: now } });
    }
  }
  return due.length;
}

/**
 * Worker: plans without custom domains get the grace period (billing settings), then their domains are
 * switched off (removed from the hostname provider, status DISABLED). Upgrading again clears the flag;
 * disabled domains are re-enabled by the client. Purchased registrations are not affected.
 */
export async function enforceDomainEntitlements(
  deps: DomainDeps,
): Promise<{ warned: number; disabled: number }> {
  const now = deps.now?.() ?? new Date();
  const { gracePeriodDays } = await getBillingSettings();
  const domains = await db.domain.findMany({
    where: { status: { not: DomainStatus.DISABLED } },
    include: { site: { select: { ownerId: true } } },
  });
  const byOwner = new Map<string, typeof domains>();
  for (const domain of domains)
    byOwner.set(domain.site.ownerId, [...(byOwner.get(domain.site.ownerId) ?? []), domain]);

  const result = { warned: 0, disabled: 0 };
  for (const [ownerId, owned] of byOwner) {
    const allowed = can(await getEntitlements(ownerId), "customDomain");
    if (allowed) {
      if (owned.some((d) => d.entitlementLostAt)) {
        await db.domain.updateMany({
          where: { id: { in: owned.map((d) => d.id) } },
          data: { entitlementLostAt: null },
        });
      }
      continue;
    }
    const fresh = owned.filter((d) => !d.entitlementLostAt);
    if (fresh.length > 0) {
      await db.domain.updateMany({
        where: { id: { in: fresh.map((d) => d.id) } },
        data: { entitlementLostAt: now },
      });
      await sendDomainMail(deps, ownerId, "domainsDisabledSoon", {
        domain: fresh.map((d) => d.hostname).join(", "),
        days: gracePeriodDays,
      });
      result.warned += 1;
    }
    const expired = owned.filter(
      (d) =>
        d.entitlementLostAt && now.getTime() - d.entitlementLostAt.getTime() >= gracePeriodDays * 86_400_000,
    );
    for (const domain of expired) {
      if (domain.providerHostnameId) {
        try {
          await deps.hostnames.delete(domain.providerHostnameId);
        } catch (error) {
          console.error(`[domains] removing ${domain.hostname} at the provider failed`, error);
          continue;
        }
      }
      await db.domain.update({
        where: { id: domain.id },
        data: { status: DomainStatus.DISABLED, providerHostnameId: null, sslStatus: null, checkedAt: now },
      });
      await deps.invalidate(domainTags(domain));
    }
    if (expired.length > 0) {
      await sendDomainMail(deps, ownerId, "domainsDisabled", {
        domain: expired.map((d) => d.hostname).join(", "),
      });
      result.disabled += expired.length;
    }
  }
  return result;
}
