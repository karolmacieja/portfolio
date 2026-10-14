import { classifyHost, type HostTarget } from "@/lib/hosts";

/**
 * Maps a request (host + path) to the internal route that renders it. Pure function so the
 * routing table is unit-testable; `src/proxy.ts` applies the result.
 *
 * Internal route prefixes (never reachable directly, every request is rewritten):
 *   /marketing/*      marketing site       (root, www.)
 *   /panel/*          client panel          (app.)
 *   /admin/*          admin panel           (admin.)
 *   /sites/{host}/*   published client site ({slug}. and custom domains)
 */

export type RouteDecision =
  | { action: "rewrite"; pathname: string; target: HostTarget["kind"] }
  | { action: "next"; target: HostTarget["kind"] }
  | { action: "notFound" };

/** API routes served on every host (infrastructure probes). */
const GLOBAL_API_PATHS = ["/api/health"];

function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function resolveRoute(host: string | null, pathname: string, rootDomain: string): RouteDecision {
  if (GLOBAL_API_PATHS.includes(pathname)) return { action: "next", target: "marketing" };

  const target = classifyHost(host, rootDomain);
  switch (target.kind) {
    case "marketing":
    case "app":
    case "admin": {
      // Platform APIs (Auth.js, email verification, ...) live under /api on platform hosts.
      if (isApiPath(pathname)) return { action: "next", target: target.kind };
      const prefix = target.kind === "app" ? "/panel" : `/${target.kind}`;
      return {
        action: "rewrite",
        pathname: prefix + (pathname === "/" ? "" : pathname),
        target: target.kind,
      };
    }
    case "site":
    case "customDomain": {
      // No platform APIs on client hosts: their cookies/sessions must never be usable there.
      if (isApiPath(pathname)) return { action: "notFound" };
      const path = pathname === "/" ? "" : pathname;
      return {
        action: "rewrite",
        pathname: `/sites/${encodeURIComponent(target.hostname)}${path}`,
        target: target.kind,
      };
    }
    case "invalid":
      return { action: "notFound" };
  }
}
