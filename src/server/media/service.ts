import "server-only";

import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getStorage } from "@/server/storage";

import { MediaError } from "./errors";
import { processImage } from "./image";

/**
 * Media library. All functions are owner-scoped (tenant isolation): a client only ever sees,
 * uses and deletes their own assets.
 */

export type AssetDto = {
  id: string;
  url: string;
  thumbUrl: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  originalName: string;
  createdAt: string;
};

const MB = 1024 * 1024;

function toDto(asset: {
  id: string;
  url: string;
  thumbUrl: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  originalName: string;
  createdAt: Date;
}): AssetDto {
  return { ...asset, createdAt: asset.createdAt.toISOString() };
}

/** Quota in bytes. Plans (Phase 3) will provide per-plan values. */
export function getQuotaBytes(): number {
  return getEnv().STORAGE_DEFAULT_QUOTA_MB * MB;
}

export function getUploadLimitBytes(): number {
  return getEnv().UPLOAD_MAX_MB * MB;
}

export async function getStorageUsage(ownerId: string): Promise<{ usedBytes: number; quotaBytes: number }> {
  const { _sum } = await db.asset.aggregate({ where: { ownerId }, _sum: { sizeBytes: true } });
  return { usedBytes: _sum.sizeBytes ?? 0, quotaBytes: getQuotaBytes() };
}

export async function listAssets(ownerId: string): Promise<AssetDto[]> {
  const assets = await db.asset.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, take: 500 });
  return assets.map(toDto);
}

function sanitizeName(name: string): string {
  return name.replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 200) || "image";
}

export async function uploadAsset(
  ownerId: string,
  file: { buffer: Buffer; name: string },
): Promise<AssetDto> {
  if (file.buffer.byteLength > getUploadLimitBytes()) throw new MediaError("fileTooLarge");

  const processed = await processImage(file.buffer);
  const sizeBytes = processed.main.buffer.byteLength + processed.thumb.buffer.byteLength;
  const { usedBytes, quotaBytes } = await getStorageUsage(ownerId);
  if (usedBytes + sizeBytes > quotaBytes) throw new MediaError("quotaExceeded");

  const storage = getStorage();
  const id = randomBytes(12).toString("base64url");
  const key = `u/${ownerId}/${id}.webp`;
  const thumbKey = `u/${ownerId}/${id}-thumb.webp`;
  await storage.put(key, processed.main.buffer, processed.contentType);
  await storage.put(thumbKey, processed.thumb.buffer, processed.contentType);

  try {
    const asset = await db.asset.create({
      data: {
        ownerId,
        key,
        url: storage.publicUrl(key),
        thumbUrl: storage.publicUrl(thumbKey),
        contentType: processed.contentType,
        sizeBytes,
        width: processed.main.width,
        height: processed.main.height,
        originalName: sanitizeName(file.name),
      },
    });
    return toDto(asset);
  } catch (error) {
    await storage.delete([key, thumbKey]).catch(() => undefined);
    throw error;
  }
}

/** Deletes the files and the record. Pages still referencing the image show nothing in its place. */
export async function deleteAsset(ownerId: string, assetId: string): Promise<void> {
  const asset = await db.asset.findFirst({ where: { id: assetId, ownerId } });
  if (!asset) throw new MediaError("notFound");
  await db.asset.delete({ where: { id: asset.id } });
  await getStorage().delete([asset.key, asset.key.replace(/\.webp$/, "-thumb.webp")]);
}
