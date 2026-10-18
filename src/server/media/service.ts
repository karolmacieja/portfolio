import "server-only";

import { randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getEntitlements } from "@/server/entitlements";
import { getStorage } from "@/server/storage";

import { MediaError } from "./errors";
import { processImage } from "./image";
import { assetStorageKeys } from "./keys";

/**
 * Media library. All functions are owner-scoped (tenant isolation): a client only ever sees,
 * uses and deletes their own assets.
 */

export type AssetKind = "image" | "document";

export type AssetDto = {
  id: string;
  kind: AssetKind;
  url: string;
  thumbUrl: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  originalName: string;
  createdAt: string;
};

const MB = 1024 * 1024;

export const PDF_CONTENT_TYPE = "application/pdf";
/** Documents (PDF) are stored as uploaded, so they get their own, smaller size limit. */
export const DOCUMENT_MAX_MB = 10;

function toDto({
  contentType,
  ...asset
}: {
  id: string;
  url: string;
  thumbUrl: string;
  contentType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  originalName: string;
  createdAt: Date;
}): AssetDto {
  return {
    ...asset,
    kind: contentType === PDF_CONTENT_TYPE ? "document" : "image",
    createdAt: asset.createdAt.toISOString(),
  };
}

/** A PDF is recognised by its signature (the first bytes), never by the name or declared type. */
export function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Storage quota in bytes from the user's plan (or the entry plan without a subscription). */
export async function getQuotaBytes(ownerId: string): Promise<number> {
  return (await getEntitlements(ownerId)).limits.storageMb * MB;
}

export function getUploadLimitBytes(): number {
  return getEnv().UPLOAD_MAX_MB * MB;
}

export async function getStorageUsage(ownerId: string): Promise<{ usedBytes: number; quotaBytes: number }> {
  const [{ _sum }, quotaBytes] = await Promise.all([
    db.asset.aggregate({ where: { ownerId }, _sum: { sizeBytes: true } }),
    getQuotaBytes(ownerId),
  ]);
  return { usedBytes: _sum.sizeBytes ?? 0, quotaBytes };
}

export async function listAssets(ownerId: string, kind?: AssetKind): Promise<AssetDto[]> {
  const contentType =
    kind === "document" ? PDF_CONTENT_TYPE : kind === "image" ? { not: PDF_CONTENT_TYPE } : undefined;
  const assets = await db.asset.findMany({
    where: { ownerId, ...(contentType ? { contentType } : {}) },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return assets.map(toDto);
}

function sanitizeName(name: string, fallback = "image"): string {
  return name.replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 200) || fallback;
}

/** Stores a PDF unchanged (downloaded as an attachment, never shown inline on our origin). */
async function uploadDocument(ownerId: string, file: { buffer: Buffer; name: string }): Promise<AssetDto> {
  if (file.buffer.byteLength > DOCUMENT_MAX_MB * MB) throw new MediaError("fileTooLarge");
  const sizeBytes = file.buffer.byteLength;
  const { usedBytes, quotaBytes } = await getStorageUsage(ownerId);
  if (usedBytes + sizeBytes > quotaBytes) throw new MediaError("quotaExceeded");

  const name = sanitizeName(file.name, "document.pdf").replace(/(\.pdf)?$/i, ".pdf");
  const storage = getStorage();
  const key = `u/${ownerId}/${randomBytes(12).toString("base64url")}.pdf`;
  await storage.put(key, file.buffer, PDF_CONTENT_TYPE, { downloadName: name });
  try {
    const asset = await db.asset.create({
      data: {
        ownerId,
        key,
        url: storage.publicUrl(key),
        thumbUrl: "",
        contentType: PDF_CONTENT_TYPE,
        sizeBytes,
        originalName: name,
      },
    });
    return toDto(asset);
  } catch (error) {
    await storage.delete([key]).catch(() => undefined);
    throw error;
  }
}

/** Images are verified and optimized (see image.ts); PDFs are stored as documents. */
export async function uploadAsset(
  ownerId: string,
  file: { buffer: Buffer; name: string },
): Promise<AssetDto> {
  if (isPdf(file.buffer)) return uploadDocument(ownerId, file);
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
  await getStorage().delete(assetStorageKeys(asset.key));
}
