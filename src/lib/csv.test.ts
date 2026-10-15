import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes separators and neutralizes formulas", () => {
    expect(toCsv([["a,b", 'say "hi"', "=SUM(A1)", null, 3]])).toBe('"a,b","say ""hi""",\'=SUM(A1),,3');
    expect(toCsv([["line\nbreak"]])).toBe('"line\nbreak"');
  });
});
