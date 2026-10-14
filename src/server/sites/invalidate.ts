import "server-only";

import { revalidateTag } from "next/cache";

/**
 * Expires cached site data immediately (no stale-while-revalidate), so a publish is
 * visible on the next request. Usable from server actions and route handlers.
 */
export function invalidateTags(tags: readonly string[]): void {
  for (const tag of new Set(tags)) revalidateTag(tag, { expire: 0 });
}
