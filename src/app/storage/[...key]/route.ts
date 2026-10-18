import { getEnv } from "@/lib/env";
import { LocalStorageProvider } from "@/server/storage/local";

const CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  pdf: "application/pdf",
};
/** Documents are always downloaded, never rendered on our origin. */
const ATTACHMENTS = new Set(["pdf"]);

/** Serves files of the local storage provider (development only; S3/R2 serve files themselves). */
export async function GET(_request: Request, { params }: RouteContext<"/storage/[...key]">) {
  const env = getEnv();
  if (env.STORAGE_PROVIDER !== "local") return new Response("Not Found", { status: 404 });

  const key = (await params).key.join("/");
  const data = await new LocalStorageProvider(env.STORAGE_LOCAL_DIR).read(key);
  if (!data) return new Response("Not Found", { status: 404 });

  const extension = key.split(".").pop() ?? "";
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      ...(ATTACHMENTS.has(extension) ? { "content-disposition": "attachment" } : {}),
    },
  });
}
