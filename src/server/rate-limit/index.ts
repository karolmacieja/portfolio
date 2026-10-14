import type Redis from "ioredis";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the current window resets. */
  resetMs: number;
};

export interface RateLimiter {
  /** Counts a hit for `key` and reports whether it is within `limit` per `windowMs`. */
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

/** Fixed-window limiter backed by Redis (shared across app instances). */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "rl:",
  ) {}

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const fullKey = this.prefix + key;
    const results = await this.redis
      .multi()
      .incr(fullKey)
      .pexpire(fullKey, windowMs, "NX")
      .pttl(fullKey)
      .exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[2]?.[1] ?? windowMs);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetMs: ttl > 0 ? ttl : windowMs,
    };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}

/** In-process limiter for tests and single-instance tooling. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    return {
      allowed: window.count <= limit,
      remaining: Math.max(0, limit - window.count),
      resetMs: window.resetAt - now,
    };
  }

  async reset(key: string): Promise<void> {
    this.windows.delete(key);
  }
}
