import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../app.js";
import { getStorage, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE } from "../storage/index.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

export const uploadRoutes = new Hono<AppEnv>();

// All upload routes require auth + tenant context.
uploadRoutes.use("*", authMiddleware, tenantMiddleware);

/**
 * POST /uploads/image — Upload a product image.
 *
 * Accepts multipart/form-data with a single "file" field.
 * Validates file type (JPEG, PNG, WebP, AVIF) and size (max 5 MB).
 * Returns the public URL of the uploaded image.
 *
 * The key format is: {tenantId}/{timestamp}-{random}.{ext}
 * This ensures uniqueness and tenant-scoped storage.
 */
uploadRoutes.post("/image", async (c) => {
  const tenantId = c.get("tenantId")!;

  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    throw new HTTPException(400, { message: "Missing 'file' field in multipart form data" });
  }

  // Validate MIME type.
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new HTTPException(400, {
      message: `Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP, AVIF`,
    });
  }

  // Validate file size.
  if (file.size > MAX_IMAGE_SIZE) {
    throw new HTTPException(400, {
      message: `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Max: 5 MB`,
    });
  }

  // Read file into buffer.
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Validate magic bytes (defense-in-depth: don't trust Content-Type alone).
  const magicType = detectImageType(buffer);
  if (!magicType) {
    throw new HTTPException(400, {
      message: "File content does not match a supported image format",
    });
  }

  // Generate storage key.
  const ext = extensionForType(magicType);
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const key = `${tenantId}/${timestamp}-${random}.${ext}`;

  // Upload.
  const storage = getStorage();
  const url = await storage.upload(key, buffer, magicType);

  return c.json({
    data: {
      url,
      key,
      contentType: magicType,
      size: file.size,
    },
  });
});

/**
 * Detect image type from magic bytes.
 * Returns the MIME type or null if not a recognized image.
 */
function detectImageType(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }

  // WebP: 52 49 46 46 ... 57 45 42 50
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  // AVIF: starts with ftyp box containing "avif" or "avis"
  if (buffer.length >= 12) {
    const ftypStr = buffer.toString("ascii", 4, 8);
    if (ftypStr === "ftyp") {
      const brand = buffer.toString("ascii", 8, 12);
      if (brand === "avif" || brand === "avis") {
        return "image/avif";
      }
    }
  }

  return null;
}

/** Map MIME type to file extension. */
function extensionForType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    default:
      return "bin";
  }
}
