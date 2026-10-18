"use client";

import { useActionState, useRef, useState } from "react";

import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SOCIAL_PLATFORMS } from "@/blocks/schemas";
import { brandContrastWarnings, platformCssVars } from "@/lib/brand-colors";
import type { ActionState } from "@/server/action-state";
import {
  saveBrandColorsAction,
  saveBrandContactAction,
  saveBrandIdentityAction,
  saveLandingTextsAction,
} from "@/server/branding/actions";
import type { PlatformBranding } from "@/server/branding/settings";
import { SITE_FONTS } from "@/themes/fonts";

/**
 * Platform branding forms (admin /branding). Labels arrive as plain strings from the server page
 * (next-intl key types of this size are too heavy for the compiler, see license-fields.tsx).
 */

export type BrandingLabels = Record<string, string>;

function Submit({ pending, label }: { pending: boolean; label: string }) {
  return (
    <div>
      <Button type="submit" size="sm" disabled={pending}>
        {label}
      </Button>
    </div>
  );
}

async function upload(file: File, kind: "logo" | "favicon") {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  const response = await fetch("/api/branding/upload", { method: "POST", body });
  const json = (await response.json().catch(() => ({}))) as {
    logoUrl?: string;
    favicon?: Record<string, string>;
    error?: string;
  };
  if (!response.ok) throw new Error(json.error ?? "generic");
  return json;
}

function ImageUpload({
  label,
  hint,
  preview,
  onFile,
  onRemove,
  labels,
  testId,
}: {
  label: string;
  hint: string;
  preview: string;
  onFile: (file: File) => Promise<void>;
  onRemove: () => void;
  labels: BrandingLabels;
  testId: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- our storage
        <img src={preview} alt="" className="max-h-16 w-fit rounded border bg-muted/40 p-2" />
      )}
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          className="hidden"
          data-testid={testId}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              await onFile(file);
            } catch (e) {
              setError(labels[`error.${(e as Error).message}`] ?? labels["error.generic"] ?? "");
            }
            setBusy(false);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? labels.uploading : preview ? labels.change : labels.upload}
        </Button>
        {preview && (
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            {labels.remove}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function BrandIdentityForm({
  branding,
  defaultName,
  labels,
}: {
  branding: PlatformBranding;
  defaultName: string;
  labels: BrandingLabels;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveBrandIdentityAction, {});
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl);
  const [favicon, setFavicon] = useState<Record<string, string>>(branding.favicon);
  return (
    <form action={action} className="grid gap-4" data-testid="brand-identity-form">
      <input type="hidden" name="logoUrl" value={logoUrl} />
      <input type="hidden" name="favicon" value={JSON.stringify(favicon)} />
      <div className="grid gap-1">
        <Label htmlFor="brand-name">{labels.name}</Label>
        <Input
          id="brand-name"
          name="name"
          maxLength={60}
          defaultValue={branding.name}
          placeholder={defaultName}
        />
        <p className="text-xs text-muted-foreground">{labels.nameHint}</p>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="brand-tagline">{labels.tagline}</Label>
        <Input id="brand-tagline" name="tagline" maxLength={160} defaultValue={branding.tagline} />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <ImageUpload
          label={labels.logo!}
          hint={labels.logoHint!}
          preview={logoUrl}
          labels={labels}
          testId="brand-logo-input"
          onFile={async (file) => setLogoUrl((await upload(file, "logo")).logoUrl ?? "")}
          onRemove={() => setLogoUrl("")}
        />
        <ImageUpload
          label={labels.favicon!}
          hint={labels.faviconHint!}
          preview={favicon["192"] ?? ""}
          labels={labels}
          testId="brand-favicon-input"
          onFile={async (file) => setFavicon((await upload(file, "favicon")).favicon ?? {})}
          onRemove={() => setFavicon({})}
        />
      </div>
      <Submit pending={pending} label={labels.save!} />
      <FormMessage state={state} success={labels.saved} />
    </form>
  );
}

export function BrandColorsForm({
  branding,
  brandName,
  labels,
}: {
  branding: PlatformBranding;
  brandName: string;
  labels: BrandingLabels;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveBrandColorsAction, {});
  const [colors, setColors] = useState({
    primaryColor: branding.primaryColor,
    accentColor: branding.accentColor,
    font: branding.font,
  });
  const warnings = brandContrastWarnings(colors);
  const colorInput = (key: "primaryColor" | "accentColor") => (
    <div className="grid gap-1">
      <Label htmlFor={`brand-${key}`}>{labels[key]}</Label>
      <div className="flex items-center gap-2">
        <input
          id={`brand-${key}`}
          type="color"
          name={key}
          value={colors[key]}
          onChange={(event) => setColors({ ...colors, [key]: event.target.value })}
          className="h-9 w-12 cursor-pointer rounded border"
        />
        <code className="text-sm">{colors[key]}</code>
      </div>
    </div>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={action} className="grid content-start gap-4" data-testid="brand-colors-form">
        <div className="flex flex-wrap gap-6">
          {colorInput("primaryColor")}
          {colorInput("accentColor")}
        </div>
        {warnings.primaryOnWhite && (
          <p className="text-sm text-amber-700" role="status" data-testid="contrast-warning">
            {labels.contrastPrimary}
          </p>
        )}
        {warnings.accentOnWhite && (
          <p className="text-sm text-amber-700" role="status">
            {labels.contrastAccent}
          </p>
        )}
        <div className="grid gap-1">
          <Label htmlFor="brand-font">{labels.font}</Label>
          <select
            id="brand-font"
            name="font"
            value={colors.font}
            onChange={(event) =>
              setColors({ ...colors, font: event.target.value as PlatformBranding["font"] })
            }
            className="h-9 w-64 rounded-md border bg-background px-2 text-sm"
          >
            <option value="system">{labels.fontSystem}</option>
            {Object.entries(SITE_FONTS).map(([id, font]) => (
              <option key={id} value={id}>
                {font.label}
              </option>
            ))}
          </select>
        </div>
        <Submit pending={pending} label={labels.save!} />
        <FormMessage state={state} success={labels.saved} />
      </form>
      <div className="grid content-start gap-2">
        <span className="text-sm font-medium">{labels.preview}</span>
        <div
          className="grid gap-4 rounded-xl border bg-background p-6 font-sans"
          style={platformCssVars(colors)}
          data-testid="brand-preview"
        >
          <p className="text-lg font-semibold">{brandName}</p>
          <p className="text-sm text-muted-foreground">{labels.previewText}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm">
              {labels.previewButton}
            </Button>
            <Button type="button" size="sm" variant="outline">
              {labels.previewSecondary}
            </Button>
            <span className="rounded-full bg-brand-accent px-3 py-1 text-xs font-medium text-brand-accent-foreground">
              {labels.previewBadge}
            </span>
            <span className="text-sm text-primary underline underline-offset-4">{labels.previewLink}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrandContactForm({
  branding,
  labels,
}: {
  branding: PlatformBranding;
  labels: BrandingLabels;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveBrandContactAction, {});
  const [socials, setSocials] = useState(branding.socials);
  return (
    <form action={action} className="grid gap-4" data-testid="brand-contact-form">
      <input type="hidden" name="socials" value={JSON.stringify(socials.filter((s) => s.url.trim()))} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="brand-email">{labels.contactEmail}</Label>
          <Input id="brand-email" name="contactEmail" type="email" defaultValue={branding.contactEmail} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="brand-phone">{labels.contactPhone}</Label>
          <Input id="brand-phone" name="contactPhone" maxLength={40} defaultValue={branding.contactPhone} />
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{labels.socials}</legend>
        {socials.map((social, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <select
              aria-label={labels.socialPlatform}
              value={social.platform}
              onChange={(event) =>
                setSocials(
                  socials.map((s, i) =>
                    i === index
                      ? { ...s, platform: event.target.value as (typeof SOCIAL_PLATFORMS)[number] }
                      : s,
                  ),
                )
              }
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {SOCIAL_PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
            <Input
              aria-label={labels.socialUrl}
              className="w-80"
              placeholder="https://"
              value={social.url}
              onChange={(event) =>
                setSocials(socials.map((s, i) => (i === index ? { ...s, url: event.target.value } : s)))
              }
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSocials(socials.filter((_, i) => i !== index))}
            >
              {labels.remove}
            </Button>
          </div>
        ))}
        {socials.length < 12 && (
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSocials([...socials, { platform: "instagram", url: "" }])}
            >
              {labels.addSocial}
            </Button>
          </div>
        )}
      </fieldset>
      <Submit pending={pending} label={labels.save!} />
      <FormMessage state={state} success={labels.saved} />
    </form>
  );
}

/** Landing texts of one locale: each field shows the default as its placeholder. */
export function LandingTextsForm({
  locale,
  groups,
  values,
  labels,
}: {
  locale: string;
  groups: { title: string; fields: { key: string; label: string; placeholder: string; long: boolean }[] }[];
  values: Record<string, string>;
  labels: BrandingLabels;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveLandingTextsAction, {});
  return (
    <form action={action} className="grid gap-6" data-testid={`landing-texts-${locale}`}>
      <input type="hidden" name="locale" value={locale} />
      {groups.map((group) => (
        <fieldset key={group.title} className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold">{group.title}</legend>
          {group.fields.map((field) => (
            <label key={field.key} className="grid gap-1 text-sm">
              <span className="text-muted-foreground">{field.label}</span>
              <textarea
                name={`text:${field.key}`}
                rows={field.long ? 3 : 1}
                maxLength={1500}
                defaultValue={values[field.key] ?? ""}
                placeholder={field.placeholder}
                className="rounded-md border bg-background p-2"
              />
            </label>
          ))}
        </fieldset>
      ))}
      <Submit pending={pending} label={labels.save!} />
      <FormMessage state={state} success={labels.saved} />
    </form>
  );
}
