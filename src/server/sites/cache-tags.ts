/**
 * Cache tags for published sites (Next.js data cache + ISR pages).
 *   host:{hostname} - host -> site resolution (also caches "no such site")
 *   site:{siteId}   - everything rendered for a site (pages, status, navigation)
 */
export const hostTag = (hostname: string) => `host:${hostname}`;
export const siteTag = (siteId: string) => `site:${siteId}`;
