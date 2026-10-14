import sharp, { type Metadata } from "sharp";

import { MediaError } from "./errors";

/** Input formats we accept (checked from file contents, not the name or declared MIME type). SVG is never accepted. */
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif"]);

export const MAX_DIMENSION = 2400;
export const THUMB_DIMENSION = 480;
const MAX_INPUT_PIXELS = 60_000_000;

export type ProcessedImage = {
  main: { buffer: Buffer; width: number; height: number };
  thumb: { buffer: Buffer };
  contentType: "image/webp";
};

/**
 * Optimizes an uploaded image: verifies the real format, applies EXIF rotation, strips metadata
 * (including GPS), bounds the size and converts to WebP (animated GIFs stay animated).
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let metadata: Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new MediaError("invalidImage");
  }
  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) throw new MediaError("unsupportedType");

  const animated = (metadata.pages ?? 1) > 1;
  const pipeline = (size: number, quality: number) =>
    sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated })
      .rotate()
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .webp({ quality });

  try {
    const main = await pipeline(MAX_DIMENSION, 82).toBuffer({ resolveWithObject: true });
    const thumb = await pipeline(THUMB_DIMENSION, 70).toBuffer();
    return {
      main: {
        buffer: main.data,
        width: main.info.width,
        // For animations sharp reports the height of the whole strip; use one frame's height.
        height: animated ? (main.info.pageHeight ?? main.info.height) : main.info.height,
      },
      thumb: { buffer: thumb },
      contentType: "image/webp",
    };
  } catch {
    throw new MediaError("invalidImage");
  }
}
