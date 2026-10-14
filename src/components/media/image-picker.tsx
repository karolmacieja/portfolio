"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import type { ImageValue } from "@/blocks/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { MediaDialog } from "./media-dialog";

type Props = {
  value: ImageValue;
  onChange: (value: ImageValue) => void;
  /** Hide the alt text input (e.g. favicon). */
  withAlt?: boolean;
  id?: string;
};

export function ImagePicker({ value, onChange, withAlt = true, id }: Props) {
  const t = useTranslations("media");
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const image = value ?? { url: "", alt: "" };

  return (
    <div className="grid gap-2" data-testid="image-picker">
      {image.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- preview from our storage
        <img src={image.url} alt={image.alt} className="max-h-40 w-full rounded-md border object-contain" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} id={id}>
          {image.url ? t("change") : t("choose")}
        </Button>
        {image.url && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ url: "", alt: "" })}>
            {t("remove")}
          </Button>
        )}
      </div>
      {withAlt && image.url && (
        <label className="grid gap-1 text-xs text-muted-foreground">
          {t("alt")}
          <Input
            value={image.alt}
            maxLength={300}
            placeholder={t("altHint")}
            onChange={(event) => onChange({ ...image, alt: event.target.value })}
          />
        </label>
      )}
      <MediaDialog
        open={open}
        onClose={close}
        onSelect={(asset) => {
          onChange({
            url: asset.url,
            alt: image.alt,
            width: asset.width ?? undefined,
            height: asset.height ?? undefined,
          });
          setOpen(false);
        }}
      />
    </div>
  );
}

/** Variant for plain URL form fields (favicon, OG image): keeps a hidden input in sync. */
export function ImageUrlField({
  name,
  defaultValue,
  withAlt = false,
}: {
  name: string;
  defaultValue: string | null;
  withAlt?: boolean;
}) {
  const [value, setValue] = useState<ImageValue>({ url: defaultValue ?? "", alt: "" });
  return (
    <>
      <input type="hidden" name={name} value={value.url} />
      <ImagePicker value={value} onChange={setValue} withAlt={withAlt} />
    </>
  );
}
