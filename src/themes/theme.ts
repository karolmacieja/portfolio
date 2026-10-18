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
    /** Optional (themes saved before Phase 13 lack them): accent defaults to primary, border is derived. */
    accent: hexColor.optional(),
    border: hexColor.optional(),
  }),
  fonts: z.object({
    heading: z.enum(SITE_FONT_IDS),
    body: z.enum(SITE_FONT_IDS),
  }),
  spacing: z.enum(["compact", "normal", "relaxed"]),
  radius: z.enum(["none", "sm", "md", "lg"]),
  buttonStyle: z.enum(["solid", "outline", "pill"]),
  headingScale: z.enum(["sm", "md", "lg"]).default("md"),
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
  headingScale: "md",
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
  warm: {
    ...DEFAULT_THEME,
    colors: {
      background: "#fffaf3",
      foreground: "#2b2118",
      muted: "#7c6a58",
      primary: "#c2410c",
      primaryForeground: "#ffffff",
      surface: "#fbeedd",
      accent: "#d97706",
    },
    fonts: { heading: "outfit", body: "manrope" },
    radius: "lg",
  },
  pastel: {
    ...DEFAULT_THEME,
    colors: {
      background: "#fbfaff",
      foreground: "#26213b",
      muted: "#6f6a86",
      primary: "#7c6cf0",
      primaryForeground: "#ffffff",
      surface: "#efedfd",
      accent: "#f08cb6",
    },
    fonts: { heading: "outfit", body: "outfit" },
    radius: "lg",
    buttonStyle: "pill",
  },
  contrast: {
    ...DEFAULT_THEME,
    colors: {
      background: "#ffffff",
      foreground: "#000000",
      muted: "#3f3f46",
      primary: "#0000ee",
      primaryForeground: "#ffffff",
      surface: "#f4f4f5",
      accent: "#e11d48",
      border: "#000000",
    },
    fonts: { heading: "space-grotesk", body: "inter" },
    radius: "none",
    headingScale: "lg",
  },
  elegant: {
    ...DEFAULT_THEME,
    colors: {
      background: "#f7f5f0",
      foreground: "#1f1d1a",
      muted: "#77716a",
      primary: "#1f1d1a",
      primaryForeground: "#f7f5f0",
      surface: "#ece8df",
      accent: "#a1855c",
    },
    fonts: { heading: "cormorant-garamond", body: "raleway" },
    radius: "none",
    spacing: "relaxed",
    buttonStyle: "outline",
    headingScale: "lg",
  },
};

/** Stored theme JSON -> valid theme (falls back to the default for missing/invalid data). */
export function parseTheme(value: unknown): Theme {
  const result = themeSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_THEME;
}

const HEADING_SCALE: Record<Theme["headingScale"], string> = { sm: "0.85", md: "1", lg: "1.15" };

/** Mixes two "#rrggbb" colours (weight = share of `a`), used to derive the border colour. */
export function mixHex(a: string, b: string, weight: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(channel(a, i) * weight + channel(b, i) * (1 - weight))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Full palette including the optional colours (accent falls back to primary, border is derived). */
export function themePalette(theme: Theme): Required<Theme["colors"]> {
  return {
    ...theme.colors,
    accent: theme.colors.accent ?? theme.colors.primary,
    border: theme.colors.border ?? mixHex(theme.colors.foreground, theme.colors.background, 0.15),
  };
}

const SPACING: Record<Theme["spacing"], string> = { compact: "3rem", normal: "5rem", relaxed: "7.5rem" };
const RADIUS: Record<Theme["radius"], string> = { none: "0px", sm: "0.25rem", md: "0.5rem", lg: "1rem" };

/** CSS custom properties consumed by block styles (src/blocks/blocks.css). */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const radius = RADIUS[theme.radius];
  const palette = themePalette(theme);
  return {
    // Raw palette for block colours chosen from the theme (never overridden inside blocks).
    ...Object.fromEntries(Object.entries(palette).map(([key, value]) => [`--site-c-${key}`, value])),
    "--site-accent": palette.accent,
    "--site-border": palette.border,
    "--site-heading-scale": HEADING_SCALE[theme.headingScale],
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
