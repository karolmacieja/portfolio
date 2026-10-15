import { NextResponse, type NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { verifySignedToken } from "@/lib/signed-token";
import { REVALIDATE_TOKEN_PURPOSE } from "@/server/cache/remote-invalidate";
import { invalidateTags } from "@/server/sites/invalidate";

/** Internal: cache invalidation requested by the worker (signed with AUTH_SECRET, short-lived). */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const payload = body?.token
    ? verifySignedToken<{ tags: unknown }>(body.token, getEnv().AUTH_SECRET, REVALIDATE_TOKEN_PURPOSE)
    : null;
  const tags = Array.isArray(payload?.tags)
    ? payload.tags.filter((t): t is string => typeof t === "string")
    : null;
  if (!tags) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  invalidateTags(tags.slice(0, 500));
  return NextResponse.json({ revalidated: tags.length });
}
