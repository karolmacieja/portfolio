import { getClientIp } from "@/lib/request";
import { recordPageView } from "@/server/stats/collect";

/**
 * GET /_p/v?p={path} on a client host: the page view beacon (a 1x1 image in published pages of plans with
 * `analytics`). No cookies, no JavaScript; always answers with the same uncached pixel.
 */

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function pixel() {
  return new Response(PIXEL, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(request: Request, { params }: RouteContext<"/sites/[host]/_p/v">) {
  const host = decodeURIComponent((await params).host);
  const path = new URL(request.url).searchParams.get("p") ?? "";
  // Prefetches and link previews are not visits.
  const purpose = request.headers.get("sec-purpose") ?? request.headers.get("purpose");
  if (path.length <= 100 && !purpose?.includes("prefetch")) {
    try {
      await recordPageView({
        host,
        path,
        ip: getClientIp(request.headers),
        userAgent: request.headers.get("user-agent"),
      });
    } catch (error) {
      console.error("[stats] page view not recorded", error);
    }
  }
  return pixel();
}
