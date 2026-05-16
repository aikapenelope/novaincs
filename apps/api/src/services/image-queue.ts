/**
 * BullMQ queue and worker for async image processing.
 *
 * Flow:
 *   1. Upload route enqueues a "process-image" job
 *   2. Worker picks it up, calls fal.ai via image-processor service
 *   3. Downloads the result, uploads to R2
 *   4. Updates the product record with the processed image URL
 *
 * The queue uses Redis (same instance as cache/Prefect).
 * If Redis is unavailable, enqueue() logs a warning and returns null (graceful degradation).
 */

import { Queue, Worker, Job } from "bullmq";
import { getRedisConnection } from "./redis.js";
import { removeBackground, type ImageProvider } from "./image-processor.js";
import { getStorage } from "../storage/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageJobData {
  /** Public URL of the original image (on R2). */
  imageUrl: string;
  /** Storage key of the original image (for naming the processed version). */
  originalKey: string;
  /** Tenant that owns this image. */
  tenantId: string;
  /** Optional product ID to update after processing. */
  productId?: string;
  /** Which fal.ai provider to use. */
  provider: ImageProvider;
}

export interface ImageJobResult {
  /** R2 URL of the processed image. */
  processedUrl: string;
  /** Provider that was used. */
  provider: ImageProvider;
  /** Processing time in milliseconds. */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

const QUEUE_NAME = "image-processing";

let _queue: Queue<ImageJobData, ImageJobResult> | null = null;

export function getImageQueue(): Queue<ImageJobData, ImageJobResult> | null {
  if (_queue) return _queue;

  const redis = getRedisConnection();
  if (!redis) return null;

  _queue = new Queue<ImageJobData, ImageJobResult>(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  return _queue;
}

/**
 * Enqueue an image for background removal.
 * Returns the job ID, or null if the queue is unavailable.
 */
export async function enqueueImageProcessing(data: ImageJobData): Promise<string | null> {
  const queue = getImageQueue();
  if (!queue) {
    console.warn("[image-queue] Queue unavailable, skipping image processing");
    return null;
  }

  const job = await queue.add("process-image", data, {
    priority: data.provider === "fal-bria" ? 1 : 2, // Premium jobs first
  });

  return job.id ?? null;
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

let _worker: Worker<ImageJobData, ImageJobResult> | null = null;

/**
 * Start the image processing worker.
 * Call once at server startup. Processes jobs sequentially (concurrency: 2).
 */
export function startImageWorker(): void {
  const redis = getRedisConnection();
  if (!redis) {
    console.warn("[image-worker] Redis unavailable, worker not started");
    return;
  }

  _worker = new Worker<ImageJobData, ImageJobResult>(
    QUEUE_NAME,
    async (job: Job<ImageJobData, ImageJobResult>) => {
      const start = Date.now();
      const { imageUrl, originalKey, tenantId, provider } = job.data;

      console.log(`[image-worker] Processing job ${job.id}: ${provider} for tenant ${tenantId}`);

      // 1. Call fal.ai to remove background
      const result = await removeBackground(imageUrl, provider);

      // 2. Download processed image from fal.ai CDN
      const response = await fetch(result.url);
      if (!response.ok) {
        throw new Error(`Failed to download processed image: ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());

      // 3. Upload to R2 with a "processed" prefix
      const processedKey = originalKey.replace(`${tenantId}/`, `${tenantId}/processed/`);
      const storage = getStorage();
      const processedUrl = await storage.upload(processedKey, buffer, result.contentType);

      const durationMs = Date.now() - start;
      console.log(`[image-worker] Done job ${job.id}: ${processedUrl} (${durationMs}ms)`);

      return { processedUrl, provider, durationMs };
    },
    {
      connection: redis,
      concurrency: 2,
      limiter: {
        max: 10, // Max 10 jobs per minute (rate limit fal.ai calls)
        duration: 60_000,
      },
    },
  );

  _worker.on("failed", (job, err) => {
    console.error(
      `[image-worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
    );
  });

  _worker.on("completed", (job) => {
    console.log(`[image-worker] Job ${job.id} completed`);
  });

  console.log("[image-worker] Worker started (concurrency: 2)");
}

/**
 * Gracefully shut down the worker and queue.
 * Call on SIGTERM/SIGINT for clean shutdown.
 */
export async function stopImageWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
