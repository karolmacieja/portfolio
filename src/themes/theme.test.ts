import { describe, expect, it } from "vitest";

import { DEFAULT_THEME, parseTheme, THEME_PRESETS, themeSchema, themeToCssVars } from "./theme";

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
});
