import { mkdir, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StorageAdapter } from "./types.js";

/**
 * Local filesystem storage adapter for development.
 * Stores files under a configurable base directory and serves them
 * via a static file route in the API.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;
  private baseUrl: string;

  constructor(baseDir?: string, baseUrl?: string) {
    this.baseDir = baseDir || join(process.cwd(), ".uploads");
    this.baseUrl = baseUrl || "http://localhost:3000/files";
  }

  async upload(key: string, data: Buffer | Uint8Array, _contentType: string): Promise<string> {
    const filePath = join(this.baseDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return `${this.baseUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.baseDir, key);
    try {
      await unlink(filePath);
    } catch {
      // File may not exist — ignore.
    }
  }
}
