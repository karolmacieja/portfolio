import type { PagePathError } from "@/lib/page-path";

export type TemplateErrorCode =
  | "notFound"
  | "slugInvalid"
  | "slugTaken"
  | "accessDenied"
  | "invalidContent"
  | "tierTooLow"
  | "pathTaken"
  | "cannotDeleteHome"
  | "noPublishedVersion"
  | "userNotFound"
  | "noLocks"
  | `path.${PagePathError}`;

/** Expected template failures; mapped to `templates.errors.*` messages. */
export class TemplateError extends Error {
  constructor(
    readonly code: TemplateErrorCode,
    readonly details?: unknown,
  ) {
    super(`Template operation failed: ${code}`);
    this.name = "TemplateError";
  }
}
