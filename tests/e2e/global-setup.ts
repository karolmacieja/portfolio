import "dotenv/config";

import Redis from "ioredis";

/** Clears rate-limit counters so repeated local runs don't lock out the test accounts. */
export default async function globalSetup() {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  try {
    const keys = await redis.keys("rl:*");
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    await redis.quit();
  }
}
