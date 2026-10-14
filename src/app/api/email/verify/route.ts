import { NextResponse, type NextRequest } from "next/server";

import { withPublicOrigin } from "@/lib/public-request";
import { consumeEmailVerification } from "@/server/auth/email-verification";

export async function GET(request: NextRequest) {
  const { nextUrl } = withPublicOrigin(request);
  const token = nextUrl.searchParams.get("token");
  const ok = token ? await consumeEmailVerification(token) : false;
  return NextResponse.redirect(new URL(`/email-verified?status=${ok ? "ok" : "invalid"}`, nextUrl));
}
