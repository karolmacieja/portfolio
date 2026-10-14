import type { NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { getRequestOrigin } from "@/lib/request";

import { loadSiteForHost } from "../data";

export async function GET(request: NextRequest, { params }: RouteContext<"/sites/[host]/robots.txt">) {
  const site = await loadSiteForHost((await params).host);
  const indexable = site?.published && !site.suspended && !site.noIndex;
  const origin = getRequestOrigin(request.headers, getEnv().APP_PROTOCOL);
  const body = indexable
    ? `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
