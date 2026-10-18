import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { assertSafeKey, attachmentDisposition, type StorageProvider } from "./types";

export type S3Config = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
  forcePathStyle: boolean;
};

/** S3-compatible storage: MinIO locally, Cloudflare R2 in production. */
export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(
    key: string,
    body: Buffer,
    contentType: string,
    options?: { downloadName?: string },
  ): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(options?.downloadName ? { ContentDisposition: attachmentDisposition(options.downloadName) } : {}),
        // Keys are unique per upload, so objects never change.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  async delete(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    keys.forEach(assertSafeKey);
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.config.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }

  publicUrl(key: string): string {
    assertSafeKey(key);
    return `${this.config.publicUrl.replace(/\/+$/, "")}/${key}`;
  }
}
