import { DomainStatus, DomainType, Prisma } from "@/generated/prisma/client";
import { validateDomainName } from "@/lib/domain-name";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { can } from "@/server/entitlements/rules";
import { getEntitlements } from "@/server/entitlements/load";
import { siteTag } from "@/server/sites/cache-tags";

import { DomainError } from "./errors";
import { HostnameProviderError } from "./providers";
import { getDomainSettings } from "./settings";
import { applyHostnameState, dnsRecordsFor, domainTags, type DomainDeps } from "./status";

/**
 * Connected custom domains (owner-scoped: every function takes the owner's id and only touches their
 * sites). Hostnames are registered at the hostname provider right away; verification continues in
 * the worker (checkDomains) and on demand ("check now").
 */

/** A hostname held by someone else but never verified is released after this time. */
const UNVERIFIED_HOLD_MS = 48 * 60 * 60_000;

async function ownedSite(ownerId: string, siteId: string) {
  const site = await db.site.findFirst({ where: { id: siteId, ownerId }, select: { id: true, slug: true } });
  if (!site) throw new DomainError("notFound");
  return site;
}

async function ownedDomain(ownerId: string, domainId: string) {
  const domain = await db.domain.findFirst({ where: { id: domainId, site: { ownerId } } });
  if (!domain) throw new DomainError("notFound");
  return domain;
}

export async function listSiteDomains(ownerId: string, siteId: string) {
  await ownedSite(ownerId, siteId);
  return db.domain.findMany({
    where: { siteId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: {
      order: { select: { id: true, domainName: true, expiresAt: true, autoRenew: true, status: true } },
    },
  });
}

/** Releases another site's stale, never-verified claim on a hostname (squatting protection). */
async function releaseStaleClaim(hostname: string, siteId: string, deps: DomainDeps) {
  const existing = await db.domain.findUnique({ where: { hostname } });
  if (!existing) return;
  const stale =
    existing.siteId !== siteId &&
    existing.status !== DomainStatus.ACTIVE &&
    existing.type === DomainType.CONNECTED &&
    (deps.now?.() ?? new Date()).getTime() - existing.createdAt.getTime() > UNVERIFIED_HOLD_MS;
  if (!stale) throw new DomainError("hostnameTaken");
  if (existing.providerHostnameId)
    await deps.hostnames.delete(existing.providerHostnameId).catch(() => undefined);
  await db.domain.delete({ where: { id: existing.id } });
  await deps.invalidate(domainTags(existing));
}

/** Registers a hostname for the site at the provider and stores it as PENDING_DNS. */
async function attachHostname(
  input: { siteId: string; hostname: string; type: DomainType; isPrimary: boolean; orderId?: string },
  deps: DomainDeps,
) {
  let domain;
  try {
    domain = await db.domain.create({
      data: {
        siteId: input.siteId,
        hostname: input.hostname,
        type: input.type,
        isPrimary: input.isPrimary,
        orderId: input.orderId,
        dnsRecords: dnsRecordsFor(input.hostname, null, deps),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError("hostnameTaken");
    }
    throw error;
  }
  try {
    return await applyHostnameState(domain, await deps.hostnames.create(input.hostname), deps);
  } catch (error) {
    await db.domain.delete({ where: { id: domain.id } });
    if (error instanceof HostnameProviderError) {
      console.error(`[domains] provider refused ${input.hostname}`, error);
      throw new DomainError("providerError");
    }
    throw error;
  }
}

/**
 * Connects a domain to a site (plan feature customDomain). With `includeCompanion`, the www/apex
 * counterpart is added too and redirects to the entered hostname. The site's first domain becomes
 * its primary address once it is active.
 */
export async function addDomain(
  ownerId: string,
  siteId: string,
  input: { hostname: string; includeCompanion: boolean },
  deps: DomainDeps,
) {
  const site = await ownedSite(ownerId, siteId);
  if (!can(await getEntitlements(ownerId), "customDomain")) throw new DomainError("featureRequired");
  const env = getEnv();
  const parsed = validateDomainName(input.hostname, {
    rootDomain: env.ROOT_DOMAIN,
    allowLocalhost: env.APP_ENV !== "production",
  });
  if (!parsed.ok) throw new DomainError(`hostname.${parsed.error}`);
  const hostname = parsed.hostname;
  const companion = hostname.startsWith("www.") ? hostname.slice(4) : `www.${hostname}`;
  const hostnames =
    input.includeCompanion && !hostname.endsWith(".localhost") ? [hostname, companion] : [hostname];

  const [settings, existing] = await Promise.all([
    getDomainSettings(),
    db.domain.findMany({ where: { siteId: site.id }, select: { hostname: true, isPrimary: true } }),
  ]);
  const toAdd = hostnames.filter((h) => !existing.some((d) => d.hostname === h));
  if (toAdd.length === 0) throw new DomainError("hostnameTaken");
  if (existing.length + toAdd.length > settings.maxHostnamesPerSite) throw new DomainError("limitReached");
  for (const name of toAdd) await releaseStaleClaim(name, site.id, deps);

  const hasPrimary = existing.some((d) => d.isPrimary);
  const created = [];
  for (const name of toAdd) {
    created.push(
      await attachHostname(
        {
          siteId: site.id,
          hostname: name,
          type: DomainType.CONNECTED,
          isPrimary: !hasPrimary && name === hostname,
        },
        deps,
      ),
    );
  }
  return created;
}

export async function removeDomain(ownerId: string, domainId: string, deps: DomainDeps): Promise<void> {
  const domain = await ownedDomain(ownerId, domainId);
  if (domain.providerHostnameId) {
    try {
      await deps.hostnames.delete(domain.providerHostnameId);
    } catch (error) {
      if (error instanceof HostnameProviderError) throw new DomainError("providerError");
      throw error;
    }
  }
  await db.domain.delete({ where: { id: domain.id } });
  // Keep a primary address when other domains remain.
  if (domain.isPrimary) {
    const next =
      (await db.domain.findFirst({
        where: { siteId: domain.siteId, status: DomainStatus.ACTIVE },
        orderBy: { createdAt: "asc" },
      })) ?? (await db.domain.findFirst({ where: { siteId: domain.siteId }, orderBy: { createdAt: "asc" } }));
    if (next) await db.domain.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  await deps.invalidate(domainTags(domain));
}

/** Makes the domain the site's main address (others, and the subdomain, redirect to it when it is active). */
export async function setPrimaryDomain(ownerId: string, domainId: string, deps: DomainDeps): Promise<void> {
  const domain = await ownedDomain(ownerId, domainId);
  await db.$transaction([
    db.domain.updateMany({ where: { siteId: domain.siteId }, data: { isPrimary: false } }),
    db.domain.update({ where: { id: domain.id }, data: { isPrimary: true } }),
  ]);
  await deps.invalidate(domainTags(domain));
}

/** Platform subdomain as the main address again: no domain is primary, nothing redirects. */
export async function clearPrimaryDomain(ownerId: string, siteId: string, deps: DomainDeps): Promise<void> {
  await ownedSite(ownerId, siteId);
  await db.domain.updateMany({ where: { siteId }, data: { isPrimary: false } });
  await deps.invalidate([siteTag(siteId)]);
}

/** "Check now": asks the provider to validate again and stores the result. */
export async function checkDomainNow(ownerId: string, domainId: string, deps: DomainDeps) {
  const domain = await ownedDomain(ownerId, domainId);
  if (!domain.providerHostnameId) throw new DomainError("notFound");
  try {
    return await applyHostnameState(domain, await deps.hostnames.refresh(domain.providerHostnameId), deps);
  } catch (error) {
    if (error instanceof HostnameProviderError) throw new DomainError("providerError");
    throw error;
  }
}

/** Re-enables a domain switched off after a downgrade (the plan must include custom domains again). */
export async function reenableDomain(ownerId: string, domainId: string, deps: DomainDeps) {
  const domain = await ownedDomain(ownerId, domainId);
  if (domain.status !== DomainStatus.DISABLED) throw new DomainError("notDisabled");
  if (!can(await getEntitlements(ownerId), "customDomain")) throw new DomainError("featureRequired");
  try {
    const state = await deps.hostnames.create(domain.hostname);
    const reset = await db.domain.update({
      where: { id: domain.id },
      data: { status: DomainStatus.PENDING_DNS, entitlementLostAt: null, activatedAt: null },
    });
    return await applyHostnameState(reset, state, deps);
  } catch (error) {
    if (error instanceof HostnameProviderError) throw new DomainError("providerError");
    throw error;
  }
}

export { attachHostname };
