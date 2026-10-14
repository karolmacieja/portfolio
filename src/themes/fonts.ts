/**
 * Fonts available to client sites. Self-hosted via @fontsource-variable (imported in
 * src/themes/fonts.css), so sites make no third-party requests and the CSP stays 'self'.
 * Adding a font: install the package, import it in fonts.css, add it here.
 */
export const SITE_FONTS = {
  inter: { label: "Inter", stack: "'Inter Variable', ui-sans-serif, system-ui, sans-serif" },
  "dm-sans": { label: "DM Sans", stack: "'DM Sans Variable', ui-sans-serif, system-ui, sans-serif" },
  montserrat: { label: "Montserrat", stack: "'Montserrat Variable', ui-sans-serif, system-ui, sans-serif" },
  "space-grotesk": {
    label: "Space Grotesk",
    stack: "'Space Grotesk Variable', ui-sans-serif, system-ui, sans-serif",
  },
  "playfair-display": {
    label: "Playfair Display",
    stack: "'Playfair Display Variable', ui-serif, Georgia, serif",
  },
  fraunces: { label: "Fraunces", stack: "'Fraunces Variable', ui-serif, Georgia, serif" },
  lora: { label: "Lora", stack: "'Lora Variable', ui-serif, Georgia, serif" },
  "jetbrains-mono": { label: "JetBrains Mono", stack: "'JetBrains Mono Variable', ui-monospace, monospace" },
} as const;

export type SiteFontId = keyof typeof SITE_FONTS;
export const SITE_FONT_IDS = Object.keys(SITE_FONTS) as [SiteFontId, ...SiteFontId[]];
