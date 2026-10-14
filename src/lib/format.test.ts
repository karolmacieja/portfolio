import { describe, expect, it } from "vitest";

import { formatMegabytes, formatMoney } from "./format";

describe("format", () => {
  it("formats grosze as PLN", () => {
    expect(formatMoney(1900, "PLN", "pl").replace(/\s/g, " ")).toBe("19,00 zł");
    expect(formatMoney(79000, "PLN", "en")).toContain("790.00");
  });

  it("formats megabytes", () => {
    expect(formatMegabytes(500, "pl")).toBe("500 MB");
    expect(formatMegabytes(5120, "pl")).toBe("5 GB");
    expect(formatMegabytes(1536, "en")).toBe("1.5 GB");
  });
});
