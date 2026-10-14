export type SiteErrorCode = "notFound" | "slugInvalid" | "slugTaken" | "nothingToPublish";

/** Expected, user-facing failures of site operations; mapped to `sites.errors.*` messages. */
export class SiteError extends Error {
  constructor(readonly code: SiteErrorCode) {
    super(`Site operation failed: ${code}`);
    this.name = "SiteError";
  }
}
