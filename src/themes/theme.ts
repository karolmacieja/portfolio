import { z } from "zod";

import { SITE_FONT_IDS, SITE_FONTS } from "./fonts";

/**
 * Site theme: global design tokens applied as CSS variables. Changing the theme never touches
 * page content. Stored as JSON on Site (themeDraft / themePublished).
 */

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const themeSchema = z.object({
  colors: z.object({
    background: hexColor,
    foreground: hexColor,
    muted: hexColor,
    primary: hexColor,
    primaryForeground: hexColor,
    surface: hexColor,
  }),
  fonts: z.object({
    heading: z.enum(SITE_FONT_IDS),
    body: z.enum(SITE_FONT_IDS),
  }),
  spacing: z.enum(["compact", "normal", "relaxed"]),
  radius: z.enum(["none", "sm", "md", "lg"]),
  buttonStyle: z.enum(["solid", "outline", "pill"]),
});

export type Theme = z.infer<typeof themeSchema>;

export const DEFAULT_THEME: Theme = {
  colors: {
    background: "#ffffff",
    foreground: "#111111",
    muted: "#6b7280",
    primary: "#111111",
    primaryForeground: "#ffffff",
    surface: "#f4f4f5",
  },
  fonts: { heading: "inter", body: "inter" },
  spacing: "normal",
  radius: "md",
  buttonStyle: "solid",
};

/** Starting points offered in the theme editor. */
export const THEME_PRESETS: Record<string, Theme> = {
  minimal: DEFAULT_THEME,
  dark: {
    ...DEFAULT_THEME,
    colors: {
      background: "#0b0b0c",
      foreground: "#f4f4f5",
      muted: "#a1a1aa",
      primary: "#f4f4f5",
      primaryForeground: "#0b0b0c",
      surface: "#18181b",
    },
    fonts: { heading: "space-grotesk", body: "inter" },
  },
  editorial: {
    ...DEFAULT_THEME,
    colors: {
      background: "#faf7f2",
      foreground: "#1c1917",
      muted: "#78716c",
      primary: "#9a3412",
      primaryForeground: "#ffffff",
      surface: "#f1ebe1",
    },
    fonts: { heading: "playfair-display", body: "lora" },
    radius: "none",
    spacing: "relaxed",
  },
  studio: {
    ...DEFAULT_THEME,
    colors: {
      background: "#ffffff",
      foreground: "#0f172a",
      muted: "#64748b",
      primary: "#4f46e5",
      primaryForeground: "#ffffff",
      surface: "#eef2ff",
    },
    fonts: { heading: "dm-sans", body: "dm-sans" },
    radius: "lg",
    buttonStyle: "pill",
  },
};

/** Stored theme JSON -> valid theme (falls back to the default for missing/invalid data). */
export function parseTheme(value: unknown): Theme {
  const result = themeSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_THEME;
}

const SPACING: Record<Theme["spacing"], string> = { compact: "3rem", normal: "5rem", relaxed: "7.5rem" };
const RADIUS: Record<Theme["radius"], string> = { none: "0px", sm: "0.25rem", md: "0.5rem", lg: "1rem" };

/** CSS custom properties consumed by block styles (src/blocks/blocks.css). */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const radius = RADIUS[theme.radius];
  return {
    "--site-bg": theme.colors.background,
    "--site-fg": theme.colors.foreground,
    "--site-muted": theme.colors.muted,
    "--site-primary": theme.colors.primary,
    "--site-primary-fg": theme.colors.primaryForeground,
    "--site-surface": theme.colors.surface,
    "--site-font-heading": SITE_FONTS[theme.fonts.heading].stack,
    "--site-font-body": SITE_FONTS[theme.fonts.body].stack,
    "--site-section-space": SPACING[theme.spacing],
    "--site-radius": radius,
    "--site-btn-radius": theme.buttonStyle === "pill" ? "9999px" : radius,
    "--site-btn-bg": theme.buttonStyle === "outline" ? "transparent" : theme.colors.primary,
    "--site-btn-fg": theme.buttonStyle === "outline" ? theme.colors.primary : theme.colors.primaryForeground,
  };
}
