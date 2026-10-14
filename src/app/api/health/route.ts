import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe for the reverse proxy and uptime monitoring. */
export async function GET() {
  const checks = await Promise.allSettled([db.$queryRaw`SELECT 1`, getRedis().ping()]);
  const [database, redis] = checks.map((c) => (c.status === "fulfilled" ? "ok" : "error"));
  const healthy = checks.every((c) => c.status === "fulfilled");
  return NextResponse.json(
    { status: healthy ? "ok" : "error", database, redis },
    { status: healthy ? 200 : 503 },
  );
}
