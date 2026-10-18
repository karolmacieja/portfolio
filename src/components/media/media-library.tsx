"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { deleteAssetAction } from "@/server/media/actions";
import type { AssetDto, AssetKind } from "@/server/media/service";

import { AssetThumb } from "./asset-thumb";
import { UploadButton } from "./upload-button";

export function MediaLibrary({ assets }: { assets: AssetDto[] }) {
  const t = useTranslations("media");
  const router = useRouter();
  const [filter, setFilter] = useState<AssetKind | "all">("all");
  const visible = filter === "all" ? assets : assets.filter((asset) => asset.kind === filter);

  return (
    <div className="grid gap-6">
      <div className="w-fit">
        <UploadButton onUploaded={() => router.refresh()} accept="any" />
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t("filter")}>
        {(["all", "image", "document"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={filter === value ? "default" : "outline"}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {t(`filters.${value}`)}
          </Button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" data-testid="media-grid">
          {visible.map((asset) => (
            <li key={asset.id} className="overflow-hidden rounded-lg border">
              <AssetThumb asset={asset} />
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
