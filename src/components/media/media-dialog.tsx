"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { listAssetsAction } from "@/server/media/actions";
import type { AssetDto } from "@/server/media/service";

import { UploadButton } from "./upload-button";

type Props = { open: boolean; onClose: () => void; onSelect: (asset: AssetDto) => void };

/** Modal media library: pick an existing image or upload a new one. */
export function MediaDialog({ open, onClose, onSelect }: Props) {
  const t = useTranslations("media");
  const [assets, setAssets] = useState<AssetDto[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    listAssetsAction().then((list) => active && setAssets(list));
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      active = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-4 overflow-hidden rounded-xl bg-background p-6 text-foreground shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <div className="flex items-center gap-2">
            <UploadButton
              multiple={false}
              onUploaded={(asset) => {
                setAssets((list) => [asset, ...(list ?? [])]);
                onSelect(asset);
              }}
            />
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("close")}
            </Button>
          </div>
        </div>
        <div className="overflow-y-auto">
          {assets && assets.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {assets?.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  className="block w-full overflow-hidden rounded-md border hover:ring-2 hover:ring-ring"
                  onClick={() => onSelect(asset)}
                  title={asset.originalName}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- thumbnails from our storage */}
                  <img
                    src={asset.thumbUrl}
                    alt={asset.originalName}
                    className="aspect-square w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
