import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import { toCsv } from "@/lib/csv";
import { listContactMessages } from "@/server/contact/service";
import { can, getEntitlements } from "@/server/entitlements";

/** GET /api/messages/export[?site=id] (app host): contact form messages as CSV (plan feature `formsExport`). */
export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new NextResponse(null, { status: 401 });
  if (!can(await getEntitlements(userId), "formsExport")) return new NextResponse(null, { status: 403 });
  const siteId = request.nextUrl.searchParams.get("site") ?? undefined;
  const messages = await listContactMessages(userId, siteId ? { siteId } : {}, 10_000);
  const csv = toCsv([
    ["date", "site", "page", "name", "email", "message", "read"],
    ...messages.map((m) => [
      m.createdAt.toISOString(),
      m.site.name,
      `/${m.path}`,
      m.name,
      m.email,
      m.message,
      m.readAt ? "yes" : "no",
    ]),
  ]);
  // BOM so spreadsheet apps detect UTF-8 (Polish characters).
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wiadomosci-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
