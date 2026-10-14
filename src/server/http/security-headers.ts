/**
 * Content Security Policy for published client sites. Client content is structured JSON rendered
 * by our own components (no client HTML/JS), so the policy only has to allow what Next.js itself
 * needs. Inline scripts are required by Next's hydration payload; a nonce would make pages dynamic
 * and break ISR caching.
 */
export function siteContentSecurityPolicy(isDev: boolean, mediaOrigin?: string): string {
  // Media may live on a non-https origin locally (MinIO at http://localhost:9000).
  const media = mediaOrigin && !mediaOrigin.startsWith("https:") ? ` ${mediaOrigin}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${media}`,
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "media-src 'self' https:",
    // Whitelisted embeds (Video block, Phase 2).
    "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
