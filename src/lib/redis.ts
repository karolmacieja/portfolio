import Redis from "ioredis";

import { getEnv } from "@/lib/env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
  }
  return globalForRedis.redis;
}
