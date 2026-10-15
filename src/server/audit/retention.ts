import { db } from "@/lib/db";

/** Owner decision: audit entries are kept for two years (they hold IP addresses). */
export const AUDIT_RETENTION_DAYS = 730;

export async function purgeAuditLog(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86_400_000);
  const { count } = await db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}
