import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import pl from "../../messages/pl.json";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

describe("message catalogs", () => {
  it("en has exactly the same keys as pl (the source locale)", () => {
    expect(keys(en).sort()).toEqual(keys(pl).sort());
  });
});
