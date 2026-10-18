import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { platformBrandingSchema } from "./settings";

describe("platform branding schema", () => {
  it("fills defaults and refuses unsafe values", () => {
    expect(platformBrandingSchema.parse({})).toMatchObject({
      name: "",
      primaryColor: "#171717",
      font: "system",
    });
    for (const bad of [
      { primaryColor: "red" },
      { logoUrl: "javascript:alert(1)" },
      { favicon: { "32": "data:image/png;base64,x" } },
      { socials: [{ platform: "instagram", url: "javascript:x" }] },
      { contactEmail: "nope" },
      { font: "comic-sans" },
    ]) {
      expect(platformBrandingSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("keeps only known, non-empty landing texts", () => {
    const parsed = platformBrandingSchema.parse({
      landing: { pl: { "home.title": " Witaj ", "home.subtitle": "  ", "evil.key": "x" } },
    });
    expect(parsed.landing).toEqual({ pl: { "home.title": "Witaj" } });
  });
});

// Saving merges partial updates; the name falls back to BRAND_NAME. Uses (and restores) the shared setting.
describe.skipIf(!process.env.DATABASE_URL)("platform branding (database)", async () => {
  const { db } = await import("@/lib/db");
  const settings = await import("./settings");
  let original: unknown;

  beforeAll(async () => {
    original = (await db.setting.findUnique({ where: { key: "platformBranding" } }))?.value;
  });
  afterAll(async () => {
    if (original === undefined) await db.setting.deleteMany({ where: { key: "platformBranding" } });
    else await db.setting.update({ where: { key: "platformBranding" }, data: { value: original as object } });
  });

  it("merges partial saves and resolves the brand name", async () => {
    await db.setting.deleteMany({ where: { key: "platformBranding" } });
    expect(await settings.getBrandName()).toBe(process.env.BRAND_NAME || "Portfolio");
    await settings.savePlatformBranding({ name: "Studio Test", primaryColor: "#1d4ed8" });
    await settings.savePlatformBranding({ contactPhone: "+48 1" });
    const saved = await settings.getPlatformBrandingSettings();
    expect(saved).toMatchObject({ name: "Studio Test", primaryColor: "#1d4ed8", contactPhone: "+48 1" });
    expect(await settings.getBrandName()).toBe("Studio Test");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("platform logo and favicon", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "branding-test-"));
  process.env.STORAGE_PROVIDER = "local";
  process.env.STORAGE_LOCAL_DIR = dir;
  const assets = await import("./assets");
  const { MediaError } = await import("@/server/media/errors");
  const { LocalStorageProvider } = await import("@/server/storage/local");
  const storage = new LocalStorageProvider(dir);

  afterAll(() => rm(dir, { recursive: true, force: true }));

  const png = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 4, background: "#4f46e5" } })
      .png()
      .toBuffer();

  it("bounds the logo and generates every favicon size as PNG", async () => {
    const { url } = await assets.storeLogo(await png(2000, 500));
    const logo = await sharp((await storage.read(url.replace("/storage/", "")))!).metadata();
    expect([logo.format, logo.width, logo.height]).toEqual(["png", 800, 200]);

    const icons = await assets.storeFavicon(await png(600, 400));
    expect(Object.keys(icons).sort()).toEqual(["180", "192", "32", "512"]);
    const small = await sharp((await storage.read(icons["32"]!.replace("/storage/", "")))!).metadata();
    expect([small.width, small.height]).toEqual([32, 32]);
  });

  it("refuses files that are not raster images", async () => {
    await expect(assets.storeLogo(Buffer.from("<svg onload=alert(1)>"))).rejects.toEqual(
      new MediaError("invalidImage"),
    );
  });
});
