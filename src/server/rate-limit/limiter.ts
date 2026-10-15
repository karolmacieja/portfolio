import "server-only";

import { getRedis } from "@/lib/redis";

import { RedisRateLimiter, type RateLimiter } from "./index";

let limiter: RateLimiter | undefined;

export function getRateLimiter(): RateLimiter {
  limiter ??= new RedisRateLimiter(getRedis());
  return limiter;
}

/** Named policies so limits are tuned in one place. */
export const RATE_LIMITS = {
  signInPerEmail: { limit: 10, windowMs: 15 * 60_000 },
  signInPerIp: { limit: 30, windowMs: 15 * 60_000 },
  registerPerIp: { limit: 5, windowMs: 60 * 60_000 },
  magicLinkPerEmail: { limit: 5, windowMs: 15 * 60_000 },
  verifyEmailPerUser: { limit: 3, windowMs: 15 * 60_000 },
  checkoutPerUser: { limit: 20, windowMs: 15 * 60_000 },
  domainSearchPerUser: { limit: 30, windowMs: 10 * 60_000 },
  domainChangesPerUser: { limit: 30, windowMs: 10 * 60_000 },
  domainAuthCodePerUser: { limit: 5, windowMs: 60 * 60_000 },
} as const;
