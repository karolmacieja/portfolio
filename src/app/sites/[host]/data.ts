import "server-only";

import { cache } from "react";

import { getPublishedSite, resolveSiteIdByHost } from "@/server/sites/public";

/** Host param -> published site; deduplicated across layout, page and metadata in one render. */
export const loadSiteForHost = cache(async (hostParam: string) => {
  const siteId = await resolveSiteIdByHost(decodeURIComponent(hostParam));
  return siteId ? getPublishedSite(siteId) : null;
});
