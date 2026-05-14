// Qyne Merchant Dashboard — Nuxt 3 SSR on Hetzner
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  // Runtime config (injected from environment variables)
  runtimeConfig: {
    public: {
      apiUrl: process.env.NUXT_PUBLIC_API_URL || "http://localhost:3000",
    },
  },

  // TypeScript strict mode
  typescript: {
    strict: true,
  },
});
