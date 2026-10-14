import Redis from "ioredis";
import { afterAll, describe, expect, it } from "vitest";

import { MemoryRateLimiter, RedisRateLimiter, type RateLimiter } from "./index";

async function exerciseLimiter(limiter: RateLimiter, key: string) {
  const first = await limiter.hit(key, 2, 60_000);
  const second = await limiter.hit(key, 2, 60_000);
  const third = await limiter.hit(key, 2, 60_000);
  return { first, second, third };
}

describe("MemoryRateLimiter", () => {
  it("allows up to the limit within a window", async () => {
    const { first, second, third } = await exerciseLimiter(new MemoryRateLimiter(), "k");
    expect([first.allowed, second.allowed, third.allowed]).toEqual([true, true, false]);
    expect(first.remaining).toBe(1);
    expect(third.remaining).toBe(0);
  });

  it("starts a new window once the previous one expires", async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(() => now);
    await limiter.hit("k", 1, 1000);
    expect((await limiter.hit("k", 1, 1000)).allowed).toBe(false);
    now = 1000;
    expect((await limiter.hit("k", 1, 1000)).allowed).toBe(true);
  });

  it("reset clears the counter", async () => {
    const limiter = new MemoryRateLimiter();
    await limiter.hit("k", 1, 1000);
    await limiter.reset("k");
    expect((await limiter.hit("k", 1, 1000)).allowed).toBe(true);
  });
});

// Runs when a Redis server is available (docker compose locally, service container in CI).
describe.skipIf(!process.env.REDIS_URL)("RedisRateLimiter", () => {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const limiter = new RedisRateLimiter(redis, `test:rl:${Date.now()}:`);

  afterAll(async () => {
    await redis.quit();
  });

  it("allows up to the limit and reports the window TTL", async () => {
    const { first, second, third } = await exerciseLimiter(limiter, "k");
    expect([first.allowed, second.allowed, third.allowed]).toEqual([true, true, false]);
    expect(third.resetMs).toBeGreaterThan(0);
    expect(third.resetMs).toBeLessThanOrEqual(60_000);
  });

  it("reset clears the counter", async () => {
    await limiter.hit("r", 1, 60_000);
    await limiter.reset("r");
    expect((await limiter.hit("r", 1, 60_000)).allowed).toBe(true);
  });
});
