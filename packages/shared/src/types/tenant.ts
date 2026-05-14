/** Subscription tier for a merchant. */
export type TenantTier = "free" | "starter" | "pro" | "business";

/** Feature flags and limits per plan. */
export interface TenantPlan {
  tier: TenantTier;
  features: {
    crm_rfm_scoring: boolean;
    financial_dashboard: boolean;
    expense_tracking: boolean;
    ocr_verification: boolean;
    whatsapp_api: boolean;
    ai_agents: boolean;
    wakit_integration: boolean;
    ai_autonomous: boolean;
    public_api: boolean;
    custom_fields: boolean;
  };
  limits: {
    ai_images_per_month: number;
    products: number;
    whatsapp_broadcasts_per_month: number;
  };
}

/** A merchant account (tenant). */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  plan: TenantPlan;
  status: "active" | "suspended" | "deleted";
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
