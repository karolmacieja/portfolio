import { db } from "@/lib/db";

/** Contact messages are personal data of third parties: kept for two years, then deleted (worker, daily). */
export const CONTACT_RETENTION_DAYS = 730;

export async function purgeContactMessages(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CONTACT_RETENTION_DAYS * 86_400_000);
  const { count } = await db.contactMessage.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}
