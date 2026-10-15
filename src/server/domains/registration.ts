import { DomainOrderStatus, DomainType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isApexDomain } from "@/lib/domain-name";

import { cnameTarget } from "./dns";
import { RegistrarError, type DomainRegistrar, type Registrant, type ZoneRecord } from "./providers";
import { attachHostname } from "./service";
import { sendDomainMail, type DomainDeps } from "./status";

/**
 * Purchased domains (worker, not owner-scoped): registration after the first payment, renewal after
 * each yearly payment, and maintenance (reminders 30/7/1 days before expiry, expiry, stuck orders).
 * Steps are resumable: a retried job continues from the first missing step.
 */

export type RegistrationDeps = DomainDeps & {
  registrar: DomainRegistrar;
  nameservers: string[];
  enqueue: (job: { name: "register" | "renew"; orderId: string }, retryKey?: string) => Promise<void> | void;
};

export const REMINDER_DAYS = [30, 7, 1] as const;
const DAY_MS = 86_400_000;

/** Zone of a purchased domain: www (the site's address) via CNAME, the apex via A records if configured. */
export function zoneRecordsFor(domain: string, deps: Pick<DomainDeps, "env">): ZoneRecord[] {
  const records: ZoneRecord[] = [{ type: "CNAME", name: "www", value: cnameTarget(deps.env) }];
  if (isApexDomain(domain)) {
    for (const ip of deps.env.CUSTOM_DOMAIN_APEX_IPS) records.push({ type: "A", name: "", value: ip });
  }
  return records;
}

async function fail(orderId: string, error: unknown, final: boolean) {
  const message = error instanceof Error ? error.message : String(error);
  const retryable = !(error instanceof RegistrarError) || error.retryable;
  const failed = final || !retryable;
  await db.domainOrder.update({
    where: { id: orderId },
    data: { lastError: message.slice(0, 1000), ...(failed ? { status: DomainOrderStatus.FAILED } : {}) },
  });
  if (failed) {
    console.error(`[domains] order ${orderId} needs manual review: ${message}`);
    return;
  }
  throw error;
}

/** Registers a paid order, sets up its DNS and connects www (and the apex) to the site. */
export async function registerDomain(
  orderId: string,
  deps: RegistrationDeps,
  options: { final?: boolean } = {},
) {
  let order = await db.domainOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== DomainOrderStatus.REGISTERING) return;
  await db.domainOrder.update({ where: { id: orderId }, data: { attempts: { increment: 1 } } });

  try {
    if (!order.registrarHandle) {
      const handle = await deps.registrar.createContact(order.registrant as Registrant);
      order = await db.domainOrder.update({ where: { id: orderId }, data: { registrarHandle: handle } });
    }
    if (!order.registrarDomainId) {
      const registered = await deps.registrar.register({
        domain: order.domainName,
        handle: order.registrarHandle!,
        nameservers: deps.nameservers,
        years: 1,
      });
      order = await db.domainOrder.update({
        where: { id: orderId },
        data: {
          registrarDomainId: registered.registrarDomainId,
          expiresAt: registered.expiresAt ?? new Date(Date.now() + 365 * DAY_MS),
        },
      });
    }
    await deps.registrar.setDnsRecords(order.domainName, zoneRecordsFor(order.domainName, deps));
  } catch (error) {
    return fail(orderId, error, Boolean(options.final));
  }

  // Connect it to the site: www is the main address; the apex follows when apex IPs are configured.
  if (order.siteId) {
    const hostnames = [`www.${order.domainName}`];
    if (deps.env.CUSTOM_DOMAIN_APEX_IPS.length > 0) hostnames.push(order.domainName);
    const hasPrimary = (await db.domain.count({ where: { siteId: order.siteId, isPrimary: true } })) > 0;
    for (const hostname of hostnames) {
      if (await db.domain.count({ where: { hostname } })) continue;
      try {
        await attachHostname(
          {
            siteId: order.siteId,
            hostname,
            type: DomainType.PURCHASED,
            isPrimary: !hasPrimary && hostname.startsWith("www."),
            orderId,
          },
          deps,
        );
      } catch (error) {
        // The registration itself succeeded; the client can connect the domain from the panel.
        console.error(`[domains] connecting ${hostname} failed`, error);
      }
    }
  }
  await db.domainOrder.update({
    where: { id: orderId },
    data: { status: DomainOrderStatus.ACTIVE, lastError: null, remindersSent: [] },
  });
  await sendDomainMail(deps, order.userId, "domainRegistered", { domain: order.domainName });
}

/** Extends a registration by a year after a renewal payment. */
export async function renewDomain(
  orderId: string,
  deps: RegistrationDeps,
  options: { final?: boolean } = {},
) {
  const order = await db.domainOrder.findUnique({ where: { id: orderId } });
  if (!order?.registrarDomainId) return;
  const now = deps.now?.() ?? new Date();
  // Already renewed for this payment (the job ran before and the update was stored).
  if (order.lastRenewedAt && now.getTime() - order.lastRenewedAt.getTime() < 30 * DAY_MS) return;
  try {
    const renewed = await deps.registrar.renew({
      registrarDomainId: order.registrarDomainId,
      domain: order.domainName,
      years: 1,
      currentExpiresAt: order.expiresAt,
    });
    await db.domainOrder.update({
      where: { id: orderId },
      data: {
        status: DomainOrderStatus.ACTIVE,
        expiresAt: renewed.expiresAt ?? order.expiresAt,
        lastRenewedAt: now,
        remindersSent: [],
        lastError: null,
      },
    });
  } catch (error) {
    // A failed renewal must not be dropped: keep the order ACTIVE and flag it for staff.
    const message = error instanceof Error ? error.message : String(error);
    await db.domainOrder.update({
      where: { id: orderId },
      data: { lastError: `renewal: ${message}`.slice(0, 1000) },
    });
    if (!options.final && (!(error instanceof RegistrarError) || error.retryable)) throw error;
    console.error(`[domains] renewal of ${order.domainName} needs manual review: ${message}`);
  }
}

/** Daily: renewal reminders, expiry, abandoned checkouts and registrations whose job got lost. */
export async function domainMaintenance(deps: RegistrationDeps) {
  const now = deps.now?.() ?? new Date();
  const result = { reminders: 0, expired: 0, canceled: 0, requeued: 0 };

  const active = await db.domainOrder.findMany({
    where: { status: DomainOrderStatus.ACTIVE, expiresAt: { not: null } },
  });
  for (const order of active) {
    const days = Math.ceil((order.expiresAt!.getTime() - now.getTime()) / DAY_MS);
    if (days <= 0) {
      // With auto-renewal the provider keeps retrying the payment for a while; give up after 30 days.
      if (order.autoRenew && days > -30) continue;
      await db.domainOrder.update({ where: { id: order.id }, data: { status: DomainOrderStatus.EXPIRED } });
      await sendDomainMail(deps, order.userId, "domainExpired", { domain: order.domainName });
      result.expired += 1;
      continue;
    }
    const due = REMINDER_DAYS.filter((d) => days <= d && !order.remindersSent.includes(d));
    if (due.length === 0) continue;
    // One mail even when several thresholds passed at once (e.g. the worker was down).
    await db.domainOrder.update({
      where: { id: order.id },
      data: { remindersSent: [...order.remindersSent, ...due] },
    });
    await sendDomainMail(deps, order.userId, "domainRenewalReminder", { domain: order.domainName, days });
    result.reminders += 1;
  }

  const abandoned = await db.domainOrder.updateMany({
    where: { status: DomainOrderStatus.PENDING_PAYMENT, createdAt: { lt: new Date(now.getTime() - DAY_MS) } },
    data: { status: DomainOrderStatus.CANCELED },
  });
  result.canceled = abandoned.count;

  const stuck = await db.domainOrder.findMany({
    where: {
      status: DomainOrderStatus.REGISTERING,
      updatedAt: { lt: new Date(now.getTime() - 15 * 60_000) },
    },
    select: { id: true, updatedAt: true },
  });
  for (const order of stuck)
    await deps.enqueue({ name: "register", orderId: order.id }, String(order.updatedAt.getTime()));
  result.requeued = stuck.length;
  return result;
}
