// Qyne Public Catalog — Nuxt 3 SSR on Cloudflare Workers (edge)
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  // Runtime config
  runtimeConfig: {
    public: {
      apiUrl: process.env.NUXT_PUBLIC_API_URL || "http://localhost:3000",
    },
  },

  // TypeScript strict mode
  typescript: {
    strict: true,
  },

  // Cloudflare Workers preset for edge deployment.
  // In production, this renders at the nearest Cloudflare POP (~30ms TTFB).
  // For local dev, it falls back to Node.js SSR.
  nitro: {
    preset: "cloudflare-pages",
  },
});
