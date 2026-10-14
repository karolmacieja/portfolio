import { NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { getRequestOrigin } from "@/lib/request";

/** Rewrites `request.url` to the public origin the client actually used (see `getRequestOrigin`). */
export function withPublicOrigin(request: NextRequest): NextRequest {
  const origin = getRequestOrigin(request.headers, getEnv().APP_PROTOCOL);
  if (!origin || origin === request.nextUrl.origin) return request;
  return new NextRequest(request.nextUrl.href.replace(request.nextUrl.origin, origin), request);
}
