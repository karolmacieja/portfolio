"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/form-message";
import { SITE_FONT_IDS, SITE_FONTS } from "@/themes/fonts";
import { THEME_PRESETS, themePalette, themeToCssVars, type Theme } from "@/themes/theme";

const COLOR_KEYS = [
  "background",
  "foreground",
  "muted",
  "primary",
  "primaryForeground",
  "surface",
  "accent",
  "border",
] as const;

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={option.value === value ? "default" : "outline"}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

/** Theme form with presets and live preview; `save` is a server action bound to the site or template. */
export function ThemeEditor({
  save,
  initialTheme,
}: {
  /** Returns an error as a site error code ("notFound") or a full message key ("templates.errors.x"). */
  save: (theme: Theme) => Promise<{ ok?: boolean; error?: string }>;
  initialTheme: Theme;
}) {
  const t = useTranslations("theme");
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [state, setState] = useState<{ ok?: boolean; error?: string }>({});
  const [pending, startTransition] = useTransition();

  const palette = themePalette(theme);
  const update = (patch: Partial<Theme>) => {
    setTheme((current) => ({ ...current, ...patch }));
    setState({});
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      <div className="grid content-start gap-6">
        <p className="text-sm text-muted-foreground">{t("description")}</p>

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{t("presets")}</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(THEME_PRESETS).map(([key, preset]) => (
              <Button key={key} type="button" variant="outline" size="sm" onClick={() => update(preset)}>
                <span className="size-3 rounded-full border" style={{ background: preset.colors.primary }} />
                {t(`preset.${key}` as "preset.minimal")}
              </Button>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-medium">{t("colors")}</legend>
          <div className="grid grid-cols-2 gap-3">
            {COLOR_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="color"
                  value={palette[key]}
                  onChange={(event) => update({ colors: { ...theme.colors, [key]: event.target.value } })}
                  className="h-8 w-10 cursor-pointer rounded border"
                />
                {t(`color.${key}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">{t("fonts")}</legend>
          {(["heading", "body"] as const).map((key) => (
            <div key={key} className="grid gap-2">
              <Label htmlFor={`font-${key}`}>{key === "heading" ? t("headingFont") : t("bodyFont")}</Label>
              <select
                id={`font-${key}`}
                value={theme.fonts[key]}
                onChange={(event) =>
                  update({
                    fonts: { ...theme.fonts, [key]: event.target.value as Theme["fonts"]["heading"] },
                  })
                }
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {SITE_FONT_IDS.map((id) => (
                  <option key={id} value={id}>
                    {SITE_FONTS[id].label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </fieldset>

        <Segmented
          label={t("spacing")}
          value={theme.spacing}
          onChange={(spacing) => update({ spacing })}
          options={(["compact", "normal", "relaxed"] as const).map((v) => ({
            value: v,
            label: t(`spacingOption.${v}`),
          }))}
        />
        <Segmented
          label={t("radius")}
          value={theme.radius}
          onChange={(radius) => update({ radius })}
          options={(["none", "sm", "md", "lg"] as const).map((v) => ({
            value: v,
            label: t(`radiusOption.${v}`),
          }))}
        />
        <Segmented
          label={t("headingScale")}
          value={theme.headingScale}
          onChange={(headingScale) => update({ headingScale })}
          options={(["sm", "md", "lg"] as const).map((v) => ({
            value: v,
            label: t(`headingScaleOption.${v}`),
          }))}
        />
        <Segmented
          label={t("buttonStyle")}
          value={theme.buttonStyle}
          onChange={(buttonStyle) => update({ buttonStyle })}
          options={(["solid", "outline", "pill"] as const).map((v) => ({
            value: v,
            label: t(`buttonOption.${v}`),
          }))}
        />

        <div className="flex items-center gap-3">
          <Button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => setState(await save(theme)))}
          >
            {t("save")}
          </Button>
          <FormMessage
            state={{
              ok: state.ok,
              error: state.error && !state.error.includes(".") ? `sites.errors.${state.error}` : state.error,
            }}
            success={t("saved")}
          />
        </div>
      </div>

      <div className="grid content-start gap-2">
        <span className="text-sm font-medium">{t("preview")}</span>
        <div
          className="site-root overflow-hidden rounded-xl border"
          style={themeToCssVars(theme)}
          data-testid="theme-preview"
        >
          <div className="site-section">
            <h2 className="site-heading text-4xl">{t("previewHeading")}</h2>
            <p className="site-muted mt-3">{t("previewText")}</p>
            <div className="site-surface mt-6 border border-[color:var(--site-border)] p-4">
              <h3 className="site-heading text-xl">{t("previewCard")}</h3>
              <p className="mt-1">{t("previewText")}</p>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <span className="site-btn">{t("previewButton")}</span>
              <span className="site-link">{t("previewLink")}</span>
              <span className="font-semibold text-[color:var(--site-accent)]">{t("previewAccent")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
