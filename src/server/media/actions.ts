"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/server/auth/session";

import { MediaError, type MediaErrorCode } from "./errors";
import { deleteAsset, listAssets, type AssetDto, type AssetKind } from "./service";

export async function listAssetsAction(kind?: AssetKind): Promise<AssetDto[]> {
  const user = await requireUser();
  const parsed = z.enum(["image", "document"]).optional().safeParse(kind);
  return listAssets(user.id, parsed.success ? parsed.data : "image");
}

export async function deleteAssetAction(
  assetId: string,
): Promise<{ ok: true } | { ok: false; error: MediaErrorCode }> {
  const user = await requireUser();
  const parsed = z.string().min(1).max(64).safeParse(assetId);
  if (!parsed.success) return { ok: false, error: "notFound" };
  try {
    await deleteAsset(user.id, parsed.data);
  } catch (error) {
    if (error instanceof MediaError) return { ok: false, error: error.code };
    throw error;
  }
  refresh();
  return { ok: true };
}
