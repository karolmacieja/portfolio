import type { Env } from "@/lib/env";

import { MockThumbnailRenderer } from "./mock";
import { PlaywrightThumbnailRenderer } from "./playwright";
import type { ThumbnailRenderer } from "./types";

export type { ThumbnailRenderer } from "./types";

export function createThumbnailRenderer(env: Env): ThumbnailRenderer {
  return env.THUMBNAIL_PROVIDER === "playwright"
    ? new PlaywrightThumbnailRenderer(env.PLAYWRIGHT_CHROMIUM_EXECUTABLE)
    : new MockThumbnailRenderer();
}
