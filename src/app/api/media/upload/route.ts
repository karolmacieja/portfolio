import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/server/auth/session";
import { MediaError } from "@/server/media/errors";
import { getUploadLimitBytes, uploadAsset } from "@/server/media/service";
import { getRateLimiter } from "@/server/rate-limit/limiter";

const UPLOADS_PER_WINDOW = 60;
const WINDOW_MS = 10 * 60_000;

/** Multipart upload of a single image (`file` field) into the signed-in client's media library. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = await getRateLimiter().hit(`upload:${user.id}`, UPLOADS_PER_WINDOW, WINDOW_MS);
  if (!limit.allowed) return NextResponse.json({ error: "rateLimited" }, { status: 429 });

  // Reject oversized bodies before buffering them (multipart overhead allowance: 1 MB).
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > getUploadLimitBytes() + 1024 * 1024) {
    return NextResponse.json({ error: "fileTooLarge" }, { status: 413 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "invalidImage" }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "invalidImage" }, { status: 400 });

  try {
    const asset = await uploadAsset(user.id, {
      buffer: Buffer.from(await file.arrayBuffer()),
      name: file.name,
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaError) {
      const status = error.code === "fileTooLarge" ? 413 : error.code === "quotaExceeded" ? 507 : 400;
      return NextResponse.json({ error: error.code }, { status });
    }
    throw error;
  }
}
