import "dotenv/config";

import Redis from "ioredis";
import pg from "pg";

/**
 * Clears rate-limit counters and data left by previous E2E runs, so repeated local runs
 * don't lock out the test accounts or accumulate test sites.
 */
export default async function globalSetup() {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const keys = await redis.keys("rl:*");
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    await redis.quit();
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`DELETE FROM "Site" WHERE slug LIKE 'e2e-%'`);
    await client.query(`DELETE FROM "User" WHERE email LIKE 'e2e-%@example.com'`);
    await client.query(`DELETE FROM "Asset" WHERE "originalName" = 'e2e.png'`);
    await client.query(`DELETE FROM "Template" WHERE slug LIKE 'e2e-%'`);
    await client.query(`DELETE FROM "Coupon" WHERE code LIKE 'E2E%'`);
  } finally {
    await client.end();
  }
}
