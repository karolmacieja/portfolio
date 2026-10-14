import sharp from "sharp";

import { THUMBNAIL_VIEWPORT, type ThumbnailRenderer } from "./types";

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Generates a labelled placeholder instead of a real screenshot (development, tests, CI). */
export class MockThumbnailRenderer implements ThumbnailRenderer {
  readonly name = "mock";

  async render({ title }: { url: string; title: string }): Promise<Buffer> {
    const { width, height } = THUMBNAIL_VIEWPORT;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f4f4f5"/><stop offset="1" stop-color="#d4d4d8"/></linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <text x="80" y="${height / 2}" font-family="sans-serif" font-size="72" font-weight="700" fill="#18181b">${escapeXml(title)}</text>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
}
