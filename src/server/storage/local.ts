import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertSafeKey, type StorageProvider } from "./types";

export const LOCAL_STORAGE_ROUTE = "/storage";

/** Stores files on disk; served by src/app/storage/[...key]/route.ts. Development and tests only. */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private readonly root: string;

  constructor(dir: string) {
    this.root = path.resolve(dir);
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const file = path.resolve(this.root, key);
    if (!file.startsWith(this.root + path.sep)) throw new Error(`Unsafe storage key: ${key}`);
    return file;
  }

  async put(key: string, body: Buffer, _contentType?: string): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async delete(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => rm(this.resolve(key), { force: true })));
  }

  publicUrl(key: string): string {
    assertSafeKey(key);
    return `${LOCAL_STORAGE_ROUTE}/${key}`;
  }

  /** Reads a stored object; null when missing or the key is invalid. */
  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch {
      return null;
    }
  }
}
