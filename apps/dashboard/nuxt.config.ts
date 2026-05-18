// Qyne Merchant Dashboard — Nuxt 3 SSR on Hetzner
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  // Clerk auth module.
  modules: ["@clerk/nuxt", "nuxt-charts"],

  // Clerk configuration.
  // Keys are read from environment variables:
  //   NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  //   NUXT_CLERK_SECRET_KEY
  clerk: {
    signInForceRedirectUrl: "/",
    signUpForceRedirectUrl: "/",
  },

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
