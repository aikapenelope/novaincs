/**
 * Image processing service using fal.ai.
 *
 * Two providers:
 *   - fal-rembg: Open-source background removal (~$0.001/image). Default for all plans.
 *   - fal-bria:  Bria RMBG 2.0, licensed data, better quality ($0.018/image). Pro/Business.
 *
 * Both return a PNG with transparent background hosted on fal.ai's CDN.
 * The caller is responsible for downloading and re-uploading to R2 for permanent storage.
 *
 * @see https://fal.ai/models/fal-ai/imageutils/rembg
 * @see https://fal.ai/models/fal-ai/bria/background/remove
 */

import { createFalClient } from "@fal-ai/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImageProvider = "fal-rembg" | "fal-bria";

export interface ImageProcessResult {
  /** URL of the processed image on fal.ai CDN (temporary, download promptly). */
  url: string;
  width: number;
  height: number;
  contentType: string;
  fileSize: number;
  provider: ImageProvider;
}

/** fal.ai response shape for both rembg and bria endpoints. */
interface FalImageResponse {
  image: {
    url: string;
    width: number;
    height: number;
    content_type: string;
    file_size: number;
    file_name: string;
  };
}

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------

const PROVIDER_ENDPOINTS: Record<ImageProvider, string> = {
  "fal-rembg": "fal-ai/imageutils/rembg",
  "fal-bria": "fal-ai/bria/background/remove",
};

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let _fal: ReturnType<typeof createFalClient> | null = null;

function getFalClient(): ReturnType<typeof createFalClient> {
  if (!_fal) {
    const key = process.env.FAL_KEY;
    if (!key) {
      throw new Error("FAL_KEY environment variable is required for image processing");
    }
    _fal = createFalClient({ credentials: key });
  }
  return _fal;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Remove the background from an image using fal.ai.
 *
 * @param imageUrl - Public URL of the source image (must be accessible by fal.ai).
 * @param provider - Which fal.ai model to use. Defaults to "fal-rembg".
 * @returns Processed image metadata including a temporary CDN URL.
 */
export async function removeBackground(
  imageUrl: string,
  provider: ImageProvider = "fal-rembg",
): Promise<ImageProcessResult> {
  const fal = getFalClient();
  const endpoint = PROVIDER_ENDPOINTS[provider];

  const result = await fal.subscribe(endpoint, {
    input: { image_url: imageUrl },
    pollInterval: 1000,
    logs: false,
  });

  const data = result.data as FalImageResponse;

  if (!data?.image?.url) {
    throw new Error(`fal.ai ${provider} returned no image`);
  }

  return {
    url: data.image.url,
    width: data.image.width,
    height: data.image.height,
    contentType: data.image.content_type || "image/png",
    fileSize: data.image.file_size || 0,
    provider,
  };
}
