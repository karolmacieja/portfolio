import type { PagePathError } from "@/lib/page-path";

export type SiteErrorCode =
  | "notFound"
  | "slugInvalid"
  | "slugTaken"
  | "nothingToPublish"
  | "pathTaken"
  | "cannotDeleteHome"
  | "invalidContent"
  | "subscriptionRequired"
  | "blockNotAllowed"
  | "blockLocked"
  | "limit.sites"
  | "limit.pages"
  | "limit.projects"
  | `path.${PagePathError}`;

/** Expected, user-facing failures of site operations; mapped to `sites.errors.*` messages. */
export class SiteError extends Error {
  constructor(
    readonly code: SiteErrorCode,
    readonly details?: unknown,
  ) {
    super(`Site operation failed: ${code}`);
    this.name = "SiteError";
  }
}
