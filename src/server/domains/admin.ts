import "server-only";

import type { DomainOrderStatus, DomainStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/** Staff reads over all clients' domains and orders (not owner-scoped). */

export async function listAllDomains(filter: { status?: DomainStatus; q?: string } = {}) {
  return db.domain.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.q ? { hostname: { contains: filter.q.toLowerCase() } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { site: { select: { name: true, slug: true, owner: { select: { email: true } } } } },
  });
}

export async function listAllDomainOrders(filter: { status?: DomainOrderStatus; q?: string } = {}) {
  return db.domainOrder.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.q ? { domainName: { contains: filter.q.toLowerCase() } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { email: true } } },
  });
}
