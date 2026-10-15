import type { NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { getRequestOrigin } from "@/lib/request";

import { customDomainUrl } from "@/server/sites/urls";

import { loadSiteForHost } from "../data";

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

export async function GET(request: NextRequest, { params }: RouteContext<"/sites/[host]/sitemap.xml">) {
  const site = await loadSiteForHost((await params).host);
  if (!site?.published || site.suspended) return new Response("Not Found", { status: 404 });

  // URLs always use the site's main address (the primary domain when it has one).
  const origin = site.primaryHost
    ? customDomainUrl(site.primaryHost, "")
    : getRequestOrigin(request.headers, getEnv().APP_PROTOCOL);
  const urls = site.noIndex
    ? []
    : site.navigation.map(
        (page) =>
          `<url><loc>${escapeXml(`${origin}/${page.path}`)}</loc><lastmod>${page.updatedAt}</lastmod></url>`,
      );
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>\n`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8" } });
}
