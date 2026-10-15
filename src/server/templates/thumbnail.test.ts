import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

// Integration: the worker's thumbnail job with the mock renderer and local storage.
describe.skipIf(!process.env.DATABASE_URL)("template thumbnail job (database)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "thumb-test-"));
  process.env.STORAGE_PROVIDER = "local";
  process.env.STORAGE_LOCAL_DIR = dir;
  process.env.THUMBNAIL_PROVIDER = "mock";

  const { db } = await import("@/lib/db");
  const admin = await import("./admin");
  const { renderTemplateThumbnail } = await import("./thumbnail");
  const { LocalStorageProvider } = await import("@/server/storage/local");
  const ids: string[] = [];

  afterAll(async () => {
    await db.template.deleteMany({ where: { id: { in: ids } } });
    await rm(dir, { recursive: true, force: true });
  });

  it("renders, stores and links a WebP thumbnail for a published version", async () => {
    const { value } = await admin.createTemplate({
      name: "Thumb",
      slug: `thumb-${randomUUID().slice(0, 8)}`,
      category: "other",
    });
    ids.push(value.id);
    const { value: published } = await admin.publishTemplate(value.id, "system");

    const url = await renderTemplateThumbnail(value.id, published.versionId);
    expect(url).toMatch(new RegExp(`^/storage/templates/${value.id}/v1\\.webp$`));
    const file = await new LocalStorageProvider(dir).read(url!.replace("/storage/", ""));
    expect((await sharp(file!).metadata()).format).toBe("webp");
    expect((await db.template.findUniqueOrThrow({ where: { id: value.id } })).thumbnailUrl).toBe(url);
    expect(await renderTemplateThumbnail("missing", published.versionId)).toBeNull();
  });
});
