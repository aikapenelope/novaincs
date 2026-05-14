import type { StorageAdapter } from "./types.js";
import { LocalStorageAdapter } from "./local.js";
import { R2StorageAdapter } from "./r2.js";

export type { StorageAdapter } from "./types.js";
export { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE } from "./types.js";

/**
 * Get the storage adapter based on environment.
 * Uses R2 in production (when R2_ENDPOINT is set), local filesystem otherwise.
 */
let _storage: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!_storage) {
    if (process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID) {
      _storage = new R2StorageAdapter();
    } else {
      _storage = new LocalStorageAdapter();
    }
  }
  return _storage;
}
