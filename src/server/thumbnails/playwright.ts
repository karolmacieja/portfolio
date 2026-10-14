import { THUMBNAIL_VIEWPORT, type ThumbnailRenderer } from "./types";

/** Screenshots the template preview page in headless Chromium. */
export class PlaywrightThumbnailRenderer implements ThumbnailRenderer {
  readonly name = "playwright";

  constructor(private readonly executablePath?: string) {}

  async render({ url }: { url: string; title: string }): Promise<Buffer> {
    // Loaded lazily so the web app never pulls Playwright in.
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ executablePath: this.executablePath });
    try {
      const page = await browser.newPage({ viewport: THUMBNAIL_VIEWPORT, deviceScaleFactor: 1 });
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      if (!response?.ok()) throw new Error(`Preview responded with ${response?.status()} for ${url}`);
      return await page.screenshot({ type: "png" });
    } finally {
      await browser.close();
    }
  }
}
