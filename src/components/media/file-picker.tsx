"use client";

import { FileText } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import type { FileValue } from "@/blocks/schemas";
import { Button } from "@/components/ui/button";

import { MediaDialog } from "./media-dialog";

/** Picks a document (PDF) from the media library for a block field. */
export function FilePicker({
  value,
  onChange,
  id,
}: {
  value: FileValue | undefined;
  onChange: (value: FileValue) => void;
  id?: string;
}) {
  const t = useTranslations("media");
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const file = value ?? { url: "", name: "" };

  return (
    <div className="grid gap-2" data-testid="file-picker">
      {file.url && (
        <p className="flex items-center gap-2 rounded-md border p-2 text-sm">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{file.name}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} id={id}>
          {file.url ? t("change") : t("chooseFile")}
        </Button>
        {file.url && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ url: "", name: "" })}>
            {t("removeFile")}
          </Button>
        )}
      </div>
      <MediaDialog
        open={open}
        kind="document"
        onClose={close}
        onSelect={(asset) => {
          onChange({ url: asset.url, name: asset.originalName, sizeBytes: asset.sizeBytes });
          setOpen(false);
        }}
      />
    </div>
  );
}
