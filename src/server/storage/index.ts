import type { Env } from "@/lib/env";
import { getEnv } from "@/lib/env";

import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

export type { StorageProvider } from "./types";

export function createStorage(env: Env): StorageProvider {
  if (env.STORAGE_PROVIDER === "s3") {
    return new S3StorageProvider({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      publicUrl: env.S3_PUBLIC_URL!,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }
  return new LocalStorageProvider(env.STORAGE_LOCAL_DIR);
}

const globalForStorage = globalThis as unknown as { storage?: StorageProvider };

export function getStorage(): StorageProvider {
  globalForStorage.storage ??= createStorage(getEnv());
  return globalForStorage.storage;
}
