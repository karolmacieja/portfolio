import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import { assertSafeKey } from "./types";

describe("assertSafeKey", () => {
  it.each(["u/abc/file.webp", "u/a-b_c/x.thumb.webp"])("accepts %s", (key) => {
    expect(() => assertSafeKey(key)).not.toThrow();
  });

  it.each(["../etc/passwd", "u/../../x", "/abs", "u//x", "u/x\\y", ""])("rejects %j", (key) => {
    expect(() => assertSafeKey(key)).toThrow();
  });
});

describe("LocalStorageProvider", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "storage-test-"));
  const storage = new LocalStorageProvider(dir);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("stores, reads and deletes objects", async () => {
    await storage.put("u/1/a.webp", Buffer.from("data"), "image/webp");
    expect((await storage.read("u/1/a.webp"))?.toString()).toBe("data");
    expect(storage.publicUrl("u/1/a.webp")).toBe("/storage/u/1/a.webp");
    await storage.delete(["u/1/a.webp"]);
    expect(await storage.read("u/1/a.webp")).toBeNull();
  });

  it("refuses to read outside its directory", async () => {
    expect(await storage.read("../outside")).toBeNull();
  });
});

describe("S3StorageProvider", () => {
  it("builds public URLs from the configured base", () => {
    const storage = new S3StorageProvider({
      region: "auto",
      bucket: "b",
      accessKeyId: "k",
      secretAccessKey: "s",
      publicUrl: "https://cdn.example.com/",
      forcePathStyle: false,
    });
    expect(storage.publicUrl("u/1/a.webp")).toBe("https://cdn.example.com/u/1/a.webp");
  });
});
