import { describe, expect, it } from "vitest";

import { normalizePagePath, validatePagePath } from "./page-path";

describe("page paths", () => {
  it("normalizes slashes and case", () => {
    expect(normalizePagePath(" /Projekty/Dom/ ")).toBe("projekty/dom");
  });

  it.each(["o-mnie", "projekty/dom-nad-jeziorem", "a/b/c", "2024"])("accepts %s", (path) => {
    expect(validatePagePath(path)).toEqual({ ok: true });
  });

  it.each([
    ["", "empty"],
    ["a/b/c/d", "tooDeep"],
    ["o mnie", "invalidChars"],
    ["o--mnie", "invalidChars"],
    ["-a", "invalidChars"],
    ["robots.txt", "invalidChars"],
    ["żółw", "invalidChars"],
    ["storage", "reserved"],
    ["api/x", "reserved"],
    ["a".repeat(101), "tooLong"],
  ])("rejects %j (%s)", (path, error) => {
    expect(validatePagePath(path)).toEqual({ ok: false, error });
  });
});
