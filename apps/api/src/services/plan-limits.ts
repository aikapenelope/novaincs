/**
 * Plan limit enforcement for image processing.
 *
 * Checks whether a tenant can process more images based on their plan tier.
 * Uses the plan defaults from @qyne/shared and the tenant's planTier field.
 *
 * TODO: Track actual usage in a `tenant_usage` table with monthly counters.
 * For now, this checks the plan tier and returns the limit — the caller
 * should track usage externally or in Redis.
 */

import { PLAN_DEFAULTS } from "@qyne/shared";
import type { ImageProvider } from "./image-processor.js";

export interface PlanCheckResult {
  allowed: boolean;
  limit: number;
  provider: ImageProvider;
  reason?: string;
}

/**
 * Check if a tenant can use a specific image processing provider.
 *
 * @param planTier - The tenant's current plan tier (free, starter, pro, business).
 * @param provider - The requested fal.ai provider.
 * @returns Whether the operation is allowed and the monthly limit.
 */
export function checkImageProcessingLimit(
  planTier: string,
  provider: ImageProvider,
): PlanCheckResult {
  const tier = planTier as keyof typeof PLAN_DEFAULTS;
  const plan = PLAN_DEFAULTS[tier] ?? PLAN_DEFAULTS.expired;

  // Bria (premium) is only available on Pro and Business plans.
  if (provider === "fal-bria" && tier !== "pro" && tier !== "business") {
    return {
      allowed: false,
      limit: 0,
      provider,
      reason: "Professional image processing is available on Pro and Business plans",
    };
  }

  return {
    allowed: true,
    limit: plan.limits.ai_images_per_month,
    provider,
  };
}
