/**
 * Storage adapter interface.
 * Abstracts file storage so the API works with local filesystem in dev
 * and Cloudflare R2 in production.
 */
export interface StorageAdapter {
  /**
   * Upload a file and return its public URL.
   * @param key - The storage key (path) for the file, e.g. "tenants/{id}/products/{id}/image.jpg"
   * @param data - The file contents as a Buffer or Uint8Array
   * @param contentType - MIME type of the file
   * @returns The public URL of the uploaded file
   */
  upload(key: string, data: Buffer | Uint8Array, contentType: string): Promise<string>;

  /**
   * Delete a file by its key.
   */
  delete(key: string): Promise<void>;
}

/** Allowed image MIME types. */
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

/** Maximum image file size: 5 MB. */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
