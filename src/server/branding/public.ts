import "server-only";

import { unstable_cache } from "next/cache";

import { getPlatformBranding, getPlatformBrandingSettings, type PlatformBranding } from "./settings";

/**
 * Branding for Next.js renders. Cached with the `platform-branding` tag so ISR pages of client sites
 * (the "made with {brand}" footer) are refreshed when the admin saves the branding.
 */
export const PLATFORM_BRANDING_TAG = "platform-branding";

const cachedSettings = unstable_cache(getPlatformBrandingSettings, ["platform-branding"], {
  tags: [PLATFORM_BRANDING_TAG],
});

export async function getRenderBranding(): Promise<PlatformBranding> {
  try {
    return await cachedSettings();
  } catch {
    // No database (e.g. while building): the process-level loader falls back to defaults.
    return getPlatformBranding();
  }
}
