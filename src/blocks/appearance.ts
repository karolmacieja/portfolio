import type { CSSProperties } from "react";
import { z } from "zod";

/**
 * Per-block appearance shared by every block type (the `appearance` prop): colours, vertical spacing,
 * content width, visibility per device and an entrance animation. Everything is applied with CSS only
 * (inline custom properties + classes, see blocks.css), so published pages stay static and script-free.
 */

/** Theme palette entries a block colour can refer to; they follow later theme changes. */
export const THEME_COLOR_TOKENS = [
  "background",
  "foreground",
  "muted",
  "primary",
  "primaryForeground",
  "surface",
  "accent",
  "border",
] as const;
export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** "" = inherit, a theme token, or a custom "#rrggbb" colour (validated, so it can't inject CSS). */
export const colorValueSchema = z.union([
  z.literal(""),
  z.enum(THEME_COLOR_TOKENS),
  z.string().regex(HEX_COLOR, "invalidColor"),
]);
export type ColorValue = z.infer<typeof colorValueSchema>;

export const SPACE_OPTIONS = ["default", "none", "sm", "md", "lg", "xl"] as const;
export const WIDTH_OPTIONS = ["default", "narrow", "wide", "full"] as const;
export const HIDE_OPTIONS = ["none", "mobile", "desktop"] as const;
export const ANIMATION_OPTIONS = ["none", "fade", "slide-up", "zoom"] as const;

export const blockAppearanceSchema = z.object({
  background: colorValueSchema.default(""),
  text: colorValueSchema.default(""),
  paddingTop: z.enum(SPACE_OPTIONS).default("default"),
  paddingBottom: z.enum(SPACE_OPTIONS).default("default"),
  width: z.enum(WIDTH_OPTIONS).default("default"),
  hideOn: z.enum(HIDE_OPTIONS).default("none"),
  animation: z.enum(ANIMATION_OPTIONS).default("none"),
});
export type BlockAppearance = z.infer<typeof blockAppearanceSchema>;

/** CSS for a colour value: theme tokens read the palette variables set by `themeToCssVars`. */
export function colorCss(value: ColorValue | undefined): string | undefined {
  if (!value) return undefined;
  if (HEX_COLOR.test(value)) return value;
  return `var(--site-c-${value})`;
}

const SPACE: Record<Exclude<(typeof SPACE_OPTIONS)[number], "default">, string> = {
  none: "0px",
  sm: "1.5rem",
  md: "3rem",
  lg: "5rem",
  xl: "8rem",
};
const WIDTH: Record<Exclude<(typeof WIDTH_OPTIONS)[number], "default">, string> = {
  narrow: "40rem",
  wide: "80rem",
  full: "none",
};

/**
 * Inline style + classes of the wrapper around a block. In the editor hidden blocks stay visible
 * (dimmed) so they can still be selected, and animations are off so content never hides while editing.
 */
export function appearanceFrame(
  appearance: Partial<BlockAppearance> | undefined,
  editMode: boolean,
): { className: string; style: CSSProperties } {
  const a = appearance ?? {};
  const style: Record<string, string> = {};
  const classes = ["blk"];

  const background = colorCss(a.background);
  if (background) {
    style.background = background;
    classes.push("blk-has-bg");
  }
  const text = colorCss(a.text);
  if (text) {
    style.color = text;
    style["--site-fg"] = text;
    style["--site-muted"] = `color-mix(in srgb, ${text} 72%, transparent)`;
  }
  if (a.paddingTop && a.paddingTop !== "default") style["--blk-pt"] = SPACE[a.paddingTop];
  if (a.paddingBottom && a.paddingBottom !== "default") style["--blk-pb"] = SPACE[a.paddingBottom];
  if (a.width && a.width !== "default") {
    style["--blk-max"] = WIDTH[a.width];
    if (a.width === "full") classes.push("blk-full");
  }
  if (a.hideOn && a.hideOn !== "none") {
    classes.push(editMode ? `blk-edit-hide-${a.hideOn}` : `blk-hide-${a.hideOn}`);
  }
  if (!editMode && a.animation && a.animation !== "none") classes.push(`blk-anim-${a.animation}`);

  return { className: classes.join(" "), style: style as CSSProperties };
}
