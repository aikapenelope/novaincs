// Application-wide constants.

/**
 * Plan configuration per tier.
 *
 * There is NO free tier. New merchants get a 7-day Starter trial.
 * After the trial expires, the account is locked until they pay.
 * The "expired" state uses the starter config with all features disabled.
 */
export const PLAN_DEFAULTS = {
  /** Expired/locked state — trial ended, no active subscription. */
  expired: {
    tier: "expired" as const,
    features: {
      smart_feed: false,
      reports: false,
      financial_dashboard: false,
      crm_rfm_scoring: false,
      expense_tracking: false,
      ocr_verification: false,
      whatsapp_api: false,
      ai_agents: false,
      wakit_integration: false,
      ai_autonomous: false,
      public_api: false,
      custom_fields: false,
      google_sheets_import: false,
    },
    limits: {
      ai_images_per_month: 0,
      products: 0,
      whatsapp_broadcasts_per_month: 0,
    },
  },
  starter: {
    tier: "starter" as const,
    features: {
      smart_feed: true,
      reports: false,
      financial_dashboard: false,
      crm_rfm_scoring: false,
      expense_tracking: false,
      ocr_verification: false,
      whatsapp_api: false,
      ai_agents: false,
      wakit_integration: false,
      ai_autonomous: false,
      public_api: false,
      custom_fields: false,
      google_sheets_import: false,
    },
    limits: {
      ai_images_per_month: 100,
      products: Infinity,
      whatsapp_broadcasts_per_month: 0,
    },
  },
  pro: {
    tier: "pro" as const,
    features: {
      smart_feed: true,
      reports: true,
      financial_dashboard: true,
      crm_rfm_scoring: true,
      expense_tracking: true,
      ocr_verification: true,
      whatsapp_api: true,
      ai_agents: true,
      wakit_integration: false,
      ai_autonomous: false,
      public_api: false,
      custom_fields: true,
      google_sheets_import: true,
    },
    limits: {
      ai_images_per_month: Infinity,
      products: Infinity,
      whatsapp_broadcasts_per_month: 500,
    },
  },
  business: {
    tier: "business" as const,
    features: {
      smart_feed: true,
      reports: true,
      financial_dashboard: true,
      crm_rfm_scoring: true,
      expense_tracking: true,
      ocr_verification: true,
      whatsapp_api: true,
      ai_agents: true,
      wakit_integration: true,
      ai_autonomous: true,
      public_api: true,
      custom_fields: true,
      google_sheets_import: true,
    },
    limits: {
      ai_images_per_month: Infinity,
      products: Infinity,
      whatsapp_broadcasts_per_month: Infinity,
    },
  },
} as const;

/** Plan tier type. */
export type PlanTier = keyof typeof PLAN_DEFAULTS;

/** Feature name type. */
export type PlanFeature = keyof (typeof PLAN_DEFAULTS)["expired"]["features"];

/** Plan pricing in USD/month. */
export const PLAN_PRICES: Record<PlanTier, number> = {
  expired: 0,
  starter: 8,
  pro: 15,
  business: 25,
};

/** Trial duration for new accounts (days). */
export const TRIAL_DAYS = 7;

/** Default tier for new accounts. */
export const DEFAULT_TIER: PlanTier = "starter";

/** RFM segment thresholds (defaults, calibrated per-merchant after 30 days). */
export const RFM_SEGMENTS = {
  vip: { minRecency: 4, minFrequency: 4, minMonetary: 4 },
  loyal: { minRecency: 3, minFrequency: 3, minMonetary: 3 },
  promising: { minRecency: 4, minFrequency: 1, minMonetary: 4 },
  at_risk: { minRecency: 1, minFrequency: 3, minMonetary: 3 },
  hibernating: { minRecency: 1, minFrequency: 1, minMonetary: 1 },
  window_shopper: { minRecency: 3, minFrequency: 0, minMonetary: 0 },
  new: { minRecency: 5, minFrequency: 1, minMonetary: 1 },
  one_timer: { minRecency: 2, minFrequency: 1, minMonetary: 2 },
} as const;
