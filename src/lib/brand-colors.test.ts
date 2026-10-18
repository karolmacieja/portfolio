import { describe, expect, it } from "vitest";

import { brandContrastWarnings, contrastRatio, platformCssVars, readableOn } from "./brand-colors";

describe("brand colours", () => {
  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#4f46e5", "#ffffff")).toBeGreaterThan(4.5);
  });

  it("picks readable text for a colour", () => {
    expect(readableOn("#4f46e5")).toBe("#ffffff");
    expect(readableOn("#f59e0b")).toBe("#0a0a0a");
    expect(readableOn("#171717")).toBe("#ffffff");
  });

  it("warns about colours that are hard to read on white", () => {
    expect(brandContrastWarnings({ primaryColor: "#fde047", accentColor: "#fef9c3" })).toEqual({
      primaryOnWhite: true,
      accentOnWhite: true,
    });
    expect(brandContrastWarnings({ primaryColor: "#1d4ed8", accentColor: "#b45309" })).toEqual({
      primaryOnWhite: false,
      accentOnWhite: false,
    });
  });

  it("maps the branding to panel CSS variables", () => {
    const vars = platformCssVars({ primaryColor: "#4f46e5", accentColor: "#f59e0b", font: "outfit" });
    expect(vars).toMatchObject({
      "--primary": "#4f46e5",
      "--primary-foreground": "#ffffff",
      "--brand-accent": "#f59e0b",
      "--brand-accent-foreground": "#0a0a0a",
    });
    expect(vars["--platform-font"]).toContain("Outfit");
    expect(
      platformCssVars({ primaryColor: "#000000", accentColor: "#000000", font: "system" }),
    ).not.toHaveProperty("--platform-font");
  });
});
