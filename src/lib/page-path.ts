/**
 * Page paths inside a site: "" is the home page; others are 1-3 lowercase segments like
 * "projekty" or "projekty/dom-nad-jeziorem".
 */

export const MAX_PAGE_PATH_LENGTH = 100;

/** First segments used by platform routes on client hosts. */
const RESERVED_FIRST_SEGMENTS = new Set(["api", "storage", "_next", "static"]);

export type PagePathError = "empty" | "tooLong" | "invalidChars" | "tooDeep" | "reserved";

export function normalizePagePath(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
}

export function validatePagePath(path: string): { ok: true } | { ok: false; error: PagePathError } {
  if (path === "") return { ok: false, error: "empty" };
  if (path.length > MAX_PAGE_PATH_LENGTH) return { ok: false, error: "tooLong" };
  const segments = path.split("/");
  if (segments.length > 3) return { ok: false, error: "tooDeep" };
  if (!segments.every((segment) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(segment))) {
    return { ok: false, error: "invalidChars" };
  }
  if (RESERVED_FIRST_SEGMENTS.has(segments[0]!)) return { ok: false, error: "reserved" };
  return { ok: true };
}
