import { getEnv, platformUrl } from "@/lib/env";
import { createSignedToken } from "@/lib/signed-token";

export const REVALIDATE_TOKEN_PURPOSE = "revalidate";
export const REVALIDATE_PATH = "/api/internal/revalidate";

/**
 * Cache invalidation from outside Next.js (the worker): asks the web app to revalidate tags through
 * a signed internal request. `INTERNAL_APP_URL` points at the app inside the deployment network.
 */
export async function remoteInvalidate(tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  const env = getEnv();
  const base = env.INTERNAL_APP_URL ?? platformUrl("app", "");
  const token = createSignedToken({ tags }, env.AUTH_SECRET, REVALIDATE_TOKEN_PURPOSE, 60);
  const response = await fetch(`${base.replace(/\/$/, "")}${REVALIDATE_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Remote invalidation failed: ${response.status}`);
}
