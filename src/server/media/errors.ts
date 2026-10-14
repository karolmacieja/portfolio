export type MediaErrorCode =
  "notFound" | "unsupportedType" | "invalidImage" | "fileTooLarge" | "quotaExceeded";

/** Expected upload/media failures; mapped to `media.errors.*` messages. */
export class MediaError extends Error {
  constructor(readonly code: MediaErrorCode) {
    super(`Media operation failed: ${code}`);
    this.name = "MediaError";
  }
}
