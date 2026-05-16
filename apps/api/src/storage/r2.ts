import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { StorageAdapter } from "./types.js";

/**
 * Cloudflare R2 storage adapter for production.
 * Uses the AWS S3 SDK with R2's S3-compatible API.
 *
 * Requires environment variables:
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET
 *   R2_PUBLIC_URL (optional — public bucket URL for serving images)
 *
 * R2 has free egress, making it ideal for serving product images.
 */
export class R2StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "R2 storage requires R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY",
      );
    }

    this.bucket = process.env.R2_BUCKET || "qyne-images";
    this.publicUrl = process.env.R2_PUBLIC_URL || endpoint;

    this.client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async upload(key: string, data: Buffer | Uint8Array, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );

    return `${this.publicUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (err: unknown) {
      // S3 DeleteObject is idempotent — a 404 is not an error.
      const code = (err as { name?: string }).name;
      if (code !== "NoSuchKey") {
        throw err;
      }
    }
  }
}
