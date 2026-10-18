import { FileText } from "lucide-react";

import type { AssetDto } from "@/server/media/service";

/** Square preview of a media asset: the image thumbnail, or a document tile with its name. */
export function AssetThumb({ asset }: { asset: AssetDto }) {
  if (asset.kind === "document") {
    return (
      <span className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-muted p-3 text-center">
        <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
        <span className="line-clamp-2 text-xs break-all">{asset.originalName}</span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- thumbnails from our storage
    <img src={asset.thumbUrl} alt={asset.originalName} className="aspect-square w-full object-cover" />
  );
}
