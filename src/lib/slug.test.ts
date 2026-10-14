import { describe, expect, it } from "vitest";

import { RESERVED_SLUGS, slugify, validateSlug } from "./slug";

describe("validateSlug", () => {
  it.each(["jan", "jan-kowalski", "studio-42", "a1b"])("accepts %s", (slug) => {
    expect(validateSlug(slug)).toEqual({ ok: true });
  });

  it.each([
    ["ab", "tooShort"],
    ["a".repeat(41), "tooLong"],
    ["Jan", "invalidChars"],
    ["jan_kowalski", "invalidChars"],
    ["jan.kowalski", "invalidChars"],
    ["żółw", "invalidChars"],
    ["-jan", "hyphenEdge"],
    ["jan-", "hyphenEdge"],
    ["xn--abc", "punycode"],
    ["ab--cd", "punycode"],
    ["admin", "reserved"],
    ["www", "reserved"],
    ["api", "reserved"],
  ])("rejects %s (%s)", (slug, error) => {
    expect(validateSlug(slug)).toEqual({ ok: false, error });
  });

  it("reserves every platform host label", () => {
    for (const label of ["www", "app", "admin", "api", "mail"]) expect(RESERVED_SLUGS.has(label)).toBe(true);
  });
});

describe("slugify", () => {
  it.each([
    ["Jan Kowalski", "jan-kowalski"],
    ["Łukasz Żółtowski — Fotografia", "lukasz-zoltowski-fotografia"],
    ["  Studio  42!! ", "studio-42"],
    ["Ćma & Śnieg", "cma-snieg"],
  ])("%s -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("limits the length without a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(39)} b`);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });
});
