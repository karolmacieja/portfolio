import { describe, expect, it } from "vitest";

import { parseLocalDateTime } from "./timezone";

describe("parseLocalDateTime", () => {
  it("reads Polish wall-clock time in summer and winter", () => {
    expect(parseLocalDateTime("2026-07-01T10:00")?.toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(parseLocalDateTime("2026-12-01T10:00")?.toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });

  it("rejects malformed values", () => {
    expect(parseLocalDateTime("tomorrow")).toBeNull();
  });
});
