"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { deleteAssetAction } from "@/server/media/actions";
import type { AssetDto } from "@/server/media/service";

import { UploadButton } from "./upload-button";

export function MediaLibrary({ assets }: { assets: AssetDto[] }) {
  const t = useTranslations("media");
  const router = useRouter();

  return (
    <div className="grid gap-6">
      <div className="w-fit">
        <UploadButton onUploaded={() => router.refresh()} />
      </div>
      {assets.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" data-testid="media-grid">
          {assets.map((asset) => (
            <li key={asset.id} className="overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element -- thumbnails from our storage */}
              <img
                src={asset.thumbUrl}
                alt={asset.originalName}
                className="aspect-square w-full object-cover"
              />
              <div className="flex items-center justify-between gap-2 p-2 text-xs">
                <span className="truncate" title={asset.originalName}>
                  {asset.originalName}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={async () => {
                    if (!confirm(t("deleteConfirm"))) return;
                    await deleteAssetAction(asset.id);
                  }}
                >
                  {t("delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
