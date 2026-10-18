import { describe, expect, it } from "vitest";

import { DEFAULT_THEME, mixHex, parseTheme, THEME_PRESETS, themeSchema, themeToCssVars } from "./theme";

describe("theme", () => {
  it("all presets are valid themes", () => {
    for (const preset of Object.values(THEME_PRESETS))
      expect(themeSchema.safeParse(preset).success).toBe(true);
  });

  it("falls back to the default theme for invalid data", () => {
    expect(parseTheme(null)).toEqual(DEFAULT_THEME);
    expect(parseTheme({ colors: { background: "red" } })).toEqual(DEFAULT_THEME);
  });

  it("rejects CSS injection through colors", () => {
    const evil = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, primary: "red;}body{display:none" } };
    expect(themeSchema.safeParse(evil).success).toBe(false);
  });

  it("maps tokens to CSS variables", () => {
    const vars = themeToCssVars({ ...THEME_PRESETS.studio! });
    expect(vars["--site-primary"]).toBe("#4f46e5");
    expect(vars["--site-btn-radius"]).toBe("9999px");
    expect(vars["--site-font-heading"]).toContain("DM Sans");
  });

  it("outline buttons use a transparent background and the primary color as text", () => {
    const vars = themeToCssVars({ ...DEFAULT_THEME, buttonStyle: "outline" });
    expect(vars["--site-btn-bg"]).toBe("transparent");
    expect(vars["--site-btn-fg"]).toBe(DEFAULT_THEME.colors.primary);
  });

  it("keeps themes saved before accent/border/heading scale valid, deriving the new values", () => {
    const { headingScale: _scale, ...legacy } = DEFAULT_THEME;
    const theme = parseTheme(legacy);
    expect(theme.headingScale).toBe("md");
    const vars = themeToCssVars(theme);
    expect(vars["--site-accent"]).toBe(DEFAULT_THEME.colors.primary);
    expect(vars["--site-border"]).toBe(mixHex("#111111", "#ffffff", 0.15));
    expect(vars["--site-c-primaryForeground"]).toBe("#ffffff");
    expect(vars["--site-heading-scale"]).toBe("1");
  });

  it("mixes hex colours", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#ff0000", "#0000ff", 1)).toBe("#ff0000");
  });
});
