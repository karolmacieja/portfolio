import "server-only";

import { domainToASCII } from "node:url";

import type { Prisma } from "@/generated/prisma/client";
import { DomainOrderStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getEnv, platformUrl } from "@/lib/env";
import { BillingError } from "@/server/billing/errors";
import { getPaymentProvider } from "@/server/billing/provider";
import { purchaser } from "@/server/billing/service";
import { can, getEntitlements } from "@/server/entitlements";
import { getInvoicingSettings } from "@/server/invoicing/settings";

import { DomainError } from "./errors";
import { getRegistrar, type Registrant } from "./providers";
import { customerPrice, getDomainSettings } from "./settings";

/**
 * Buying domains (owner-scoped): search with prices, checkout of a yearly domain subscription,
 * auto-renewal and transfer codes. Registration happens in the worker after the payment event.
 */

export type DomainOffer = { domain: string; available: boolean; price: number | null };

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** "Jan Kowalski", "jan-kowalski.pl", "żółw" -> the name to search ("jan-kowalski", "xn--w-uga1v8h"). */
export function searchName(query: string): { name: string; extension: string | null } | null {
  const value =
    query
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0] ?? "";
  const [first, ...rest] = value.replace(/\s+/g, "-").split(".");
  const name = domainToASCII(first ?? "");
  if (!name || !LABEL.test(name)) return null;
  return { name, extension: rest.length > 0 ? rest.join(".") : null };
}

async function requirePurchaseFeature(ownerId: string) {
  if (!can(await getEntitlements(ownerId), "domainPurchase")) throw new DomainError("purchaseNotAllowed");
}

/** Checks the name in every offered extension (the typed one first) and prices it for the client. */
export async function searchDomains(ownerId: string, query: string): Promise<DomainOffer[]> {
  await requirePurchaseFeature(ownerId);
  return (await offers(query)).map(({ domain, available, price }) => ({ domain, available, price }));
}

async function offers(query: string) {
  const parsed = searchName(query);
  if (!parsed) throw new DomainError("hostname.invalid");
  const [settings, invoicing] = await Promise.all([getDomainSettings(), getInvoicingSettings()]);
  const tlds =
    parsed.extension && settings.tlds.includes(parsed.extension)
      ? [parsed.extension, ...settings.tlds.filter((t) => t !== parsed.extension)]
      : settings.tlds;
  const domains = tlds.map((tld) => `${parsed.name}.${tld}`);

  let results;
  try {
    results = await getRegistrar(getEnv()).check(domains);
  } catch (error) {
    console.error("[domains] availability check failed", error);
    throw new DomainError("providerError");
  }
  const ordered = new Set(
    (
      await db.domainOrder.findMany({
        where: {
          domainName: { in: domains },
          status: { in: [DomainOrderStatus.REGISTERING, DomainOrderStatus.ACTIVE] },
        },
        select: { domainName: true },
      })
    ).map((o) => o.domainName),
  );
  return results.map((result) => {
    const price = result.cost ? customerPrice(result.cost, settings, invoicing.vatRate) : null;
    return {
      domain: result.domain,
      available: result.available && !result.premium && !ordered.has(result.domain) && price !== null,
      price,
      cost: result.cost,
    };
  });
}

/**
 * Starts the checkout for a domain: availability and price are checked again on the server (never
 * taken from the form), the order is stored with the registrant, and the client pays the first year.
 */
export async function startDomainPurchase(
  ownerId: string,
  input: { siteId: string; domain: string; registrant: Registrant },
): Promise<string> {
  await requirePurchaseFeature(ownerId);
  const site = await db.site.findFirst({ where: { id: input.siteId, ownerId }, select: { id: true } });
  if (!site) throw new DomainError("notFound");
  const settings = await getDomainSettings();
  const domain = input.domain.toLowerCase();
  const name = searchName(domain);
  if (
    !name?.extension ||
    !settings.tlds.includes(name.extension) ||
    `${name.name}.${name.extension}` !== domain
  ) {
    throw new DomainError("tldNotOffered");
  }
  const offer = (await offers(domain)).find((o) => o.domain === domain);
  if (!offer?.available || offer.price === null) throw new DomainError("notAvailable");

  let customerId: string;
  try {
    customerId = (await purchaser(ownerId)).customerId;
  } catch (error) {
    if (error instanceof BillingError && error.code === "emailNotVerified")
      throw new DomainError("emailNotVerified");
    throw error;
  }

  // One open checkout per domain and client.
  await db.domainOrder.updateMany({
    where: { userId: ownerId, domainName: domain, status: DomainOrderStatus.PENDING_PAYMENT },
    data: { status: DomainOrderStatus.CANCELED },
  });
  const order = await db.domainOrder.create({
    data: {
      userId: ownerId,
      siteId: site.id,
      domainName: domain,
      priceAmount: offer.price,
      registrarCost: offer.cost?.amount ?? null,
      registrarCurrency: offer.cost?.currency ?? null,
      registrant: input.registrant as unknown as Prisma.InputJsonObject,
    },
  });
  const checkout = await getPaymentProvider().createDomainCheckout({
    customerId,
    amount: offer.price,
    currency: "PLN",
    name: `Domena ${domain} (1 rok)`,
    successUrl: platformUrl("app", `/sites/${site.id}/domains?purchased=1`),
    cancelUrl: platformUrl("app", `/sites/${site.id}/domains`),
    metadata: { kind: "domain", userId: ownerId, orderId: order.id },
  });
  return checkout.url;
}

export async function listDomainOrders(ownerId: string, siteId?: string) {
  return db.domainOrder.findMany({
    where: {
      userId: ownerId,
      status: { not: DomainOrderStatus.CANCELED },
      ...(siteId ? { siteId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      domainName: true,
      status: true,
      priceAmount: true,
      currency: true,
      expiresAt: true,
      autoRenew: true,
      providerSubscriptionId: true,
    },
  });
}

async function ownedOrder(ownerId: string, orderId: string) {
  const order = await db.domainOrder.findFirst({ where: { id: orderId, userId: ownerId } });
  if (!order) throw new DomainError("notFound");
  return order;
}

/** Turns auto-renewal on/off (the yearly subscription is cancelled at period end, or resumed). */
export async function setDomainAutoRenew(
  ownerId: string,
  orderId: string,
  autoRenew: boolean,
): Promise<void> {
  const order = await ownedOrder(ownerId, orderId);
  if (order.status !== DomainOrderStatus.ACTIVE || !order.providerSubscriptionId) {
    throw new DomainError("orderNotActive");
  }
  await getPaymentProvider().setCancelAtPeriodEnd({
    subscriptionId: order.providerSubscriptionId,
    cancel: !autoRenew,
  });
  // The provider's subscription event confirms it; store it now so the panel shows it right away.
  await db.domainOrder.update({ where: { id: order.id }, data: { autoRenew } });
}

/** Transfer (AuthInfo) code, to move the domain to another registrar. */
export async function getDomainAuthCode(ownerId: string, orderId: string): Promise<string> {
  const order = await ownedOrder(ownerId, orderId);
  if (order.status !== DomainOrderStatus.ACTIVE || !order.registrarDomainId)
    throw new DomainError("orderNotActive");
  try {
    return await getRegistrar(getEnv()).getAuthCode(order.registrarDomainId);
  } catch (error) {
    console.error("[domains] auth code failed", error);
    throw new DomainError("providerError");
  }
}
