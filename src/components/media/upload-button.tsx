"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { AssetDto } from "@/server/media/service";

type Props = {
  onUploaded: (asset: AssetDto) => void;
  multiple?: boolean;
  variant?: "default" | "outline";
  /** Which files the picker offers; the server checks the real type either way. */
  accept?: "image" | "document" | "any";
};

const ACCEPT = {
  image: "image/jpeg,image/png,image/webp,image/gif,image/avif",
  document: "application/pdf",
  any: "image/jpeg,image/png,image/webp,image/gif,image/avif,application/pdf",
};

/** Uploads files one by one to /api/media/upload and reports each stored asset. */
export function UploadButton({ onUploaded, multiple = true, variant = "default", accept = "image" }: Props) {
  const t = useTranslations("media");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList) {
    setBusy(true);
    setError(null);
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/media/upload", { method: "POST", body });
      const json = (await response.json().catch(() => ({}))) as { asset?: AssetDto; error?: string };
      if (response.ok && json.asset) {
        onUploaded(json.asset);
      } else {
        const code = json.error ?? "generic";
        const known = [
          "notFound",
          "unsupportedType",
          "invalidImage",
          "fileTooLarge",
          "quotaExceeded",
          "rateLimited",
        ];
        setError(`${file.name}: ${t(`errors.${(known.includes(code) ? code : "generic") as "generic"}`)}`);
        break;
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="grid gap-2">
      <input
        ref={input}
        type="file"
        accept={ACCEPT[accept]}
        multiple={multiple}
        className="hidden"
        data-testid="media-upload-input"
        onChange={(event) => event.target.files?.length && upload(event.target.files)}
      />
      <Button type="button" variant={variant} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? t("uploading") : t("upload")}
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
