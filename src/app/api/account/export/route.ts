import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { exportUserData } from "@/server/account/service";
import { getRateLimiter } from "@/server/rate-limit/limiter";

/** GET /api/account/export (app host): the signed-in client's data as a JSON download (RODO art. 15/20). */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new NextResponse(null, { status: 401 });
  if (!(await getRateLimiter().hit(`export:${userId}`, 5, 60 * 60_000)).allowed) {
    return new NextResponse(null, { status: 429 });
  }
  const data = await exportUserData(userId);
  const date = data.exportedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dane-konta-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
