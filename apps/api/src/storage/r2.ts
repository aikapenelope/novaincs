import type { StorageAdapter } from "./types.js";

/**
 * Cloudflare R2 storage adapter for production.
 * Uses the S3-compatible API via the AWS SDK.
 *
 * Requires environment variables:
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET
 *
 * R2 has free egress, making it ideal for serving product images.
 */
export class R2StorageAdapter implements StorageAdapter {
  private bucket: string;
  private endpoint: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private publicUrl: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET || "qyne-images";
    this.endpoint = process.env.R2_ENDPOINT || "";
    this.accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
    this.secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
    // R2 public bucket URL (configured in Cloudflare dashboard)
    this.publicUrl = process.env.R2_PUBLIC_URL || this.endpoint;

    if (!this.endpoint || !this.accessKeyId) {
      throw new Error("R2 storage requires R2_ENDPOINT and R2_ACCESS_KEY_ID");
    }
  }

  async upload(key: string, data: Buffer | Uint8Array, contentType: string): Promise<string> {
    // Use fetch with S3-compatible PUT (simplified — production should use @aws-sdk/client-s3).
    // For now, this is a placeholder that documents the interface.
    // The actual S3 SDK integration will be added when R2 credentials are available.
    const url = `${this.endpoint}/${this.bucket}/${key}`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(data.length),
      },
      body: data,
    });

    if (!response.ok) {
      throw new Error(`R2 upload failed: ${response.status} ${response.statusText}`);
    }

    return `${this.publicUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    const url = `${this.endpoint}/${this.bucket}/${key}`;

    const response = await fetch(url, { method: "DELETE" });

    if (!response.ok && response.status !== 404) {
      throw new Error(`R2 delete failed: ${response.status} ${response.statusText}`);
    }
  }
}
