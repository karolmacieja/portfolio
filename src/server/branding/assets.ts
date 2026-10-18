import "server-only";

import { randomBytes } from "node:crypto";

import sharp from "sharp";

import { MediaError } from "@/server/media/errors";
import { getStorage } from "@/server/storage";

import { FAVICON_SIZES } from "./settings";

/**
 * Logo and favicon of the platform (ADMIN uploads). Stored under `platform/` (not in any client's
 * library or quota). PNG output: mail clients don't show WebP, and transparency is kept. Never SVG.
 */

const ACCEPTED = new Set(["jpeg", "png", "webp", "avif"]);
const MAX_BYTES = 5 * 1024 * 1024;

async function checkImage(buffer: Buffer) {
  if (buffer.byteLength > MAX_BYTES) throw new MediaError("fileTooLarge");
  try {
    const meta = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
    if (!meta.format || !ACCEPTED.has(meta.format)) throw new MediaError("unsupportedType");
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("invalidImage");
  }
}

const key = (name: string) => `platform/${name}-${randomBytes(9).toString("base64url")}.png`;

/** Logo bounded to 800×240 (header and mails show it at most ~40 px high, 2× for sharp screens). */
export async function storeLogo(buffer: Buffer): Promise<{ url: string }> {
  await checkImage(buffer);
  const png = await sharp(buffer)
    .rotate()
    .resize({ width: 800, height: 240, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const storage = getStorage();
  const logoKey = key("logo");
  await storage.put(logoKey, png, "image/png");
  return { url: storage.publicUrl(logoKey) };
}

/** Square icon cropped from the centre in every size browsers and phones ask for. */
export async function storeFavicon(buffer: Buffer): Promise<Record<string, string>> {
  await checkImage(buffer);
  const storage = getStorage();
  const urls: Record<string, string> = {};
  for (const size of FAVICON_SIZES) {
    const png = await sharp(buffer).rotate().resize(size, size, { fit: "cover" }).png().toBuffer();
    const iconKey = key(`favicon-${size}`);
    await storage.put(iconKey, png, "image/png");
    urls[String(size)] = storage.publicUrl(iconKey);
  }
  return urls;
}
