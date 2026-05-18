import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { tenants } from "../db/schema/tenants.js";
import { PLAN_DEFAULTS } from "@qyne/shared";
import type { PlanFeature, PlanTier } from "@qyne/shared";

export function hasFeature(planTier: string, feature: PlanFeature): boolean {
  const tier = planTier as PlanTier;
  const plan = PLAN_DEFAULTS[tier] ?? PLAN_DEFAULTS.expired;
  return plan.features[feature] === true;
}

/**
 * Get the effective plan tier for a tenant.
 * If the plan has expired, downgrades to "expired" (locked state).
 */
export async function getEffectiveTier(tenantId: string): Promise<PlanTier> {
  const db = getDb();
  const [tenant] = await db
    .select({ planTier: tenants.planTier, planExpiresAt: tenants.planExpiresAt })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) return "expired";
  const tier = tenant.planTier as PlanTier;

  // If plan has an expiration date and it has passed, downgrade to expired.
  if (tier !== "expired" && tenant.planExpiresAt) {
    if (Date.now() >= new Date(tenant.planExpiresAt).getTime()) {
      await db
        .update(tenants)
        .set({ planTier: "expired", planExpiresAt: null })
        .where(eq(tenants.id, tenantId));
      return "expired";
    }
  }
  return tier;
}

export function requirePlanFeature(feature: PlanFeature): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const tenantId = c.get("tenantId");
    if (!tenantId) return c.json({ error: { message: "Tenant not found", status: 401 } }, 401);

    const tier = await getEffectiveTier(tenantId);
    if (!hasFeature(tier, feature)) {
      const tiers: PlanTier[] = ["starter", "pro", "business"];
      const requiredTier = tiers.find((t) => PLAN_DEFAULTS[t].features[feature] === true);
      return c.json(
        {
          error: {
            message: `Esta funcion requiere el plan ${requiredTier ?? "starter"} o superior.`,
            status: 403,
            code: "PLAN_REQUIRED",
            currentTier: tier,
            requiredTier: requiredTier ?? "starter",
            feature,
          },
        },
        403,
      );
    }
    await next();
  };
}
