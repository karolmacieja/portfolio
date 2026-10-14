import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { MediaError } from "./errors";
import { MAX_DIMENSION, processImage } from "./image";

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#ff0000" } })
    .png()
    .toBuffer();

describe("processImage", () => {
  it("converts to WebP and keeps small images at their size", async () => {
    const result = await processImage(await png(300, 200));
    expect(result.contentType).toBe("image/webp");
    expect((await sharp(result.main.buffer).metadata()).format).toBe("webp");
    expect([result.main.width, result.main.height]).toEqual([300, 200]);
  });

  it("bounds large images and produces a smaller thumbnail", async () => {
    const result = await processImage(await png(4000, 1000));
    expect(result.main.width).toBe(MAX_DIMENSION);
    expect(result.main.height).toBe(600);
    expect((await sharp(result.thumb.buffer).metadata()).width).toBe(480);
  });

  it("strips EXIF metadata", async () => {
    const withExif = await sharp(await png(50, 50))
      .jpeg()
      .withExif({ IFD0: { Copyright: "secret" } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const result = await processImage(withExif);
    expect((await sharp(result.main.buffer).metadata()).exif).toBeUndefined();
  });

  it("rejects SVG even though sharp can read it", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="alert(1)"/>',
    );
    await expect(processImage(svg)).rejects.toEqual(new MediaError("unsupportedType"));
  });

  it("rejects non-images regardless of the file name", async () => {
    await expect(processImage(Buffer.from("<?php echo 1;"))).rejects.toEqual(new MediaError("invalidImage"));
  });
});
