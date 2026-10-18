import { SITE_FONTS, type SiteFontId } from "@/themes/fonts";
import { mixHex } from "@/themes/theme";

/**
 * Platform colours (pure, shared by the server and the admin's live preview): derived shades,
 * readable text colours and WCAG contrast checks for the brand's primary and accent colours.
 */

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** WCAG contrast ratio between two "#rrggbb" colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black text, whichever reads better on the colour. */
export function readableOn(hex: string): string {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#0a0a0a") ? "#ffffff" : "#0a0a0a";
}

/** AA for normal text is 4.5:1; buttons and links of the brand colour sit on a white page. */
export function brandContrastWarnings(colors: { primaryColor: string; accentColor: string }) {
  return {
    primaryOnWhite: contrastRatio(colors.primaryColor, "#ffffff") < 4.5,
    accentOnWhite: contrastRatio(colors.accentColor, "#ffffff") < 3,
  };
}

/** CSS custom properties applied on the platform's <body> (panels and marketing, see globals.css). */
export function platformCssVars(branding: {
  primaryColor: string;
  accentColor: string;
  font: "system" | SiteFontId;
}): Record<string, string> {
  return {
    "--primary": branding.primaryColor,
    "--primary-foreground": readableOn(branding.primaryColor),
    "--ring": mixHex(branding.primaryColor, "#ffffff", 0.55),
    "--brand-accent": branding.accentColor,
    "--brand-accent-foreground": readableOn(branding.accentColor),
    "--brand-accent-soft": mixHex(branding.accentColor, "#ffffff", 0.12),
    ...(branding.font === "system" ? {} : { "--platform-font": SITE_FONTS[branding.font].stack }),
  };
}
