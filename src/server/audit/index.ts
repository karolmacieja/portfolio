import "server-only";

import { headers } from "next/headers";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/request";

/**
 * Audit log of administrative actions (who, what, on which record, from where). Written after the
 * action succeeded; failures to write are logged but never break the action itself.
 */
export async function audit(
  actor: { id: string } | null,
  action: string,
  target?: { type: string; id: string } | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  let ip: string | null = null;
  try {
    ip = getClientIp(await headers());
  } catch {
    // Outside a request (jobs): no IP.
  }
  try {
    await db.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        action,
        targetType: target?.type ?? null,
        targetId: target?.id ?? null,
        metadata: (metadata ?? undefined) as Prisma.InputJsonObject | undefined,
        ip,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record", action, error);
  }
}

export type AuditFilter = { action?: string; actorId?: string; targetId?: string; before?: Date };

export async function listAuditLog(filter: AuditFilter = {}, take = 100) {
  return db.auditLog.findMany({
    where: {
      ...(filter.action ? { action: { startsWith: filter.action } } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.targetId ? { targetId: filter.targetId } : {}),
      ...(filter.before ? { createdAt: { lt: filter.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: { actor: { select: { email: true } } },
  });
}
