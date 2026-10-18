import { NextResponse, type NextRequest } from "next/server";

import { hasPermission } from "@/server/auth/permissions";
import { getCurrentUser } from "@/server/auth/session";
import { storeFavicon, storeLogo } from "@/server/branding/assets";
import { MediaError } from "@/server/media/errors";

/**
 * Logo / favicon upload for the platform branding (ADMIN, admin host). Returns the stored URLs; the
 * branding form saves them together with the other fields.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "settings.manage")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 6 * 1024 * 1024) {
    return NextResponse.json({ error: "fileTooLarge" }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalidImage" }, { status: 400 });
  }
  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File) || (kind !== "logo" && kind !== "favicon")) {
    return NextResponse.json({ error: "invalidImage" }, { status: 400 });
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result =
      kind === "logo" ? { logoUrl: (await storeLogo(buffer)).url } : { favicon: await storeFavicon(buffer) };
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof MediaError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "fileTooLarge" ? 413 : 400 });
    }
    throw error;
  }
}
