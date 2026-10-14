import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MediaError } from "./errors";

// Integration tests against PostgreSQL with local file storage in a temp directory.
describe.skipIf(!process.env.DATABASE_URL)("media service (database)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "media-test-"));
  process.env.STORAGE_PROVIDER = "local";
  process.env.STORAGE_LOCAL_DIR = dir;
  process.env.STORAGE_DEFAULT_QUOTA_MB = "1";

  const { db } = await import("@/lib/db");
  const media = await import("./service");
  const { LocalStorageProvider } = await import("@/server/storage/local");
  const storage = new LocalStorageProvider(dir);

  const run = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let owner: string;
  let stranger: string;

  const image = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: "#3366ff" } })
      .png()
      .toBuffer();

  beforeAll(async () => {
    for (const name of ["owner", "stranger"]) {
      const user = await db.user.create({ data: { email: `${name}-${run}@test.local` } });
      userIds.push(user.id);
    }
    [owner, stranger] = userIds as [string, string];
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await rm(dir, { recursive: true, force: true });
  });

  it("uploads, lists and deletes an owner's asset", async () => {
    const asset = await media.uploadAsset(owner, {
      buffer: await image(800, 600),
      name: "photo<script>.png",
    });
    expect(asset.url).toMatch(/^\/storage\/u\/.+\.webp$/);
    expect(asset.originalName).toBe("photoscript.png");
    expect([asset.width, asset.height]).toEqual([800, 600]);
    expect(await storage.read(asset.url.replace("/storage/", ""))).not.toBeNull();

    expect((await media.listAssets(owner)).map((a) => a.id)).toEqual([asset.id]);
    expect(await media.listAssets(stranger)).toEqual([]);
    expect((await media.getStorageUsage(owner)).usedBytes).toBe(asset.sizeBytes);

    await expect(media.deleteAsset(stranger, asset.id)).rejects.toEqual(new MediaError("notFound"));
    await media.deleteAsset(owner, asset.id);
    expect(await storage.read(asset.url.replace("/storage/", ""))).toBeNull();
  });

  it("enforces the storage quota", async () => {
    // Random noise compresses badly, so a few uploads exceed the 1 MB test quota.
    const noise = await sharp(
      Buffer.from(Array.from({ length: 1600 * 1600 * 3 }, () => Math.floor(Math.random() * 256))),
      {
        raw: { width: 1600, height: 1600, channels: 3 },
      },
    )
      .png()
      .toBuffer();
    await expect(
      (async () => {
        for (let i = 0; i < 5; i++) await media.uploadAsset(owner, { buffer: noise, name: `n${i}.png` });
      })(),
    ).rejects.toEqual(new MediaError("quotaExceeded"));
    const { usedBytes, quotaBytes } = await media.getStorageUsage(owner);
    expect(usedBytes).toBeLessThanOrEqual(quotaBytes);
  });
});
