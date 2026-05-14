// Application-wide constants.

/** Default plan configuration per tier. */
export const PLAN_DEFAULTS = {
  free: {
    tier: "free" as const,
    features: {
      crm_rfm_scoring: false,
      financial_dashboard: false,
      expense_tracking: false,
      ocr_verification: false,
      whatsapp_api: false,
      ai_agents: false,
      wakit_integration: false,
      ai_autonomous: false,
      public_api: false,
      custom_fields: false,
    },
    limits: {
      ai_images_per_month: 10,
      products: 20,
      whatsapp_broadcasts_per_month: 0,
    },
  },
  starter: {
    tier: "starter" as const,
    features: {
      crm_rfm_scoring: false,
      financial_dashboard: false,
      expense_tracking: false,
      ocr_verification: false,
      whatsapp_api: false,
      ai_agents: false,
      wakit_integration: false,
      ai_autonomous: false,
      public_api: false,
      custom_fields: false,
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
      crm_rfm_scoring: true,
      financial_dashboard: true,
      expense_tracking: true,
      ocr_verification: true,
      whatsapp_api: true,
      ai_agents: true,
      wakit_integration: false,
      ai_autonomous: false,
      public_api: false,
      custom_fields: true,
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
      crm_rfm_scoring: true,
      financial_dashboard: true,
      expense_tracking: true,
      ocr_verification: true,
      whatsapp_api: true,
      ai_agents: true,
      wakit_integration: true,
      ai_autonomous: true,
      public_api: true,
      custom_fields: true,
    },
    limits: {
      ai_images_per_month: Infinity,
      products: Infinity,
      whatsapp_broadcasts_per_month: Infinity,
    },
  },
} as const;

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
