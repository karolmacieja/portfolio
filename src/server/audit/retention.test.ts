import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

describe.skipIf(!process.env.DATABASE_URL)("audit retention (database)", async () => {
  const { db } = await import("@/lib/db");
  const { purgeAuditLog, AUDIT_RETENTION_DAYS } = await import("./retention");

  it("removes entries older than the retention period only", async () => {
    const marker = `test.retention.${randomUUID()}`;
    const now = new Date();
    await db.auditLog.createMany({
      data: [
        { action: marker, createdAt: new Date(now.getTime() - (AUDIT_RETENTION_DAYS + 1) * 86_400_000) },
        { action: marker, createdAt: new Date(now.getTime() - (AUDIT_RETENTION_DAYS - 1) * 86_400_000) },
      ],
    });
    await purgeAuditLog(now);
    expect(await db.auditLog.count({ where: { action: marker } })).toBe(1);
    await db.auditLog.deleteMany({ where: { action: marker } });
  });
});
