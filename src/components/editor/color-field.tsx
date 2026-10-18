"use client";

import { THEME_COLOR_TOKENS, type ColorValue, type ThemeColorToken } from "@/blocks/appearance";
import { cn } from "@/lib/utils";

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Block colour picker: "inherit", a theme colour (stays linked to the theme) or a custom colour.
 * Theme swatches show the site's current palette.
 */
export function ColorField({
  id,
  value,
  onChange,
  palette,
  labels,
}: {
  id: string;
  value: ColorValue | undefined;
  onChange: (value: ColorValue) => void;
  palette: Record<ThemeColorToken, string>;
  labels: { inherit: string; custom: string; tokens: Record<ThemeColorToken, string> };
}) {
  const current = value ?? "";
  const custom = HEX.test(current) ? current : "";
  const swatch = "size-7 rounded-full border shadow-sm outline-offset-2";
  const selected = "outline outline-2 outline-foreground";

  return (
    <div className="flex flex-wrap items-center gap-1.5" id={id}>
      <button
        type="button"
        title={labels.inherit}
        aria-label={labels.inherit}
        aria-pressed={current === ""}
        onClick={() => onChange("")}
        className={cn(
          swatch,
          "bg-[linear-gradient(135deg,transparent_45%,#ef4444_45%,#ef4444_55%,transparent_55%)]",
          current === "" && selected,
        )}
      />
      {THEME_COLOR_TOKENS.map((token) => (
        <button
          key={token}
          type="button"
          title={labels.tokens[token]}
          aria-label={labels.tokens[token]}
          aria-pressed={current === token}
          onClick={() => onChange(token)}
          className={cn(swatch, current === token && selected)}
          style={{ background: palette[token] }}
        />
      ))}
      <label
        title={labels.custom}
        className={cn(
          swatch,
          "relative grid cursor-pointer place-items-center overflow-hidden bg-[conic-gradient(#ef4444,#eab308,#22c55e,#3b82f6,#a855f7,#ef4444)]",
          custom && selected,
        )}
        style={custom ? { background: custom } : undefined}
      >
        <span className="sr-only">{labels.custom}</span>
        <input
          type="color"
          value={custom || "#888888"}
          onChange={(event) => onChange(event.target.value as ColorValue)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
