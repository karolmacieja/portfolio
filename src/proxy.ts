import { NextResponse, type NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { resolveRoute } from "@/server/http/routing";
import { siteContentSecurityPolicy } from "@/server/http/security-headers";

/** Host-based routing for the whole app; see `src/server/http/routing.ts`. */
export function proxy(request: NextRequest) {
  const env = getEnv();
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const decision = resolveRoute(host, request.nextUrl.pathname, env.ROOT_DOMAIN);

  if (decision.action === "notFound") {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const response =
    decision.action === "rewrite"
      ? NextResponse.rewrite(new URL(decision.pathname + request.nextUrl.search, request.url))
      : NextResponse.next();

  if (decision.target === "app" || decision.target === "admin") {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  if (decision.target === "site" || decision.target === "customDomain") {
    response.headers.set(
      "Content-Security-Policy",
      siteContentSecurityPolicy(env.NODE_ENV === "development"),
    );
  }
  return response;
}

export const config = {
  // Everything except Next's own static assets.
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr).*)"],
};
