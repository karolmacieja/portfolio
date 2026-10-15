import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";
import { verifySignedToken } from "@/lib/signed-token";
import { UNSUBSCRIBE_PURPOSE } from "@/server/newsletter/render";
import { unsubscribe } from "@/server/newsletter/sending";

/**
 * POST /api/newsletter/unsubscribe?token= — RFC 8058 one-click unsubscribe (List-Unsubscribe-Post), called by
 * mail clients without a session. GET is not accepted: link scanners would unsubscribe people.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const payload = verifySignedToken<{ userId: string; campaignId: string | null }>(
    token,
    getEnv().AUTH_SECRET,
    UNSUBSCRIBE_PURPOSE,
  );
  if (!payload) return new NextResponse(null, { status: 400 });
  await unsubscribe(payload.userId, payload.campaignId);
  return new NextResponse(null, { status: 204 });
}
