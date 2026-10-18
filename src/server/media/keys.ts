/** Storage keys of an asset: the file and, for images, its `-thumb.webp` thumbnail. Worker-safe. */
export function assetStorageKeys(key: string): string[] {
  return key.endsWith(".webp") ? [key, key.replace(/\.webp$/, "-thumb.webp")] : [key];
}
