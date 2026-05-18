/**
 * Plan gating composable.
 *
 * Checks if the current tenant has access to a feature based on their plan.
 * Used by pages that require Pro or Business tier.
 *
 * Usage:
 *   const { hasAccess, requiredTier } = usePlanGate("reports");
 *   // In template: v-if="hasAccess" or show upgrade overlay
 */

export function usePlanGate(feature: string) {
  const { get } = useApi();

  const hasAccess = ref(true); // Default to true (optimistic)
  const requiredTier = ref("pro");
  const currentTier = ref("free");
  const loading = ref(true);

  async function checkAccess() {
    try {
      // Try to fetch plan info. If the feature is gated, the API returns 403.
      const result = await get<{ currentTier: string }>("/billing/plan");
      const raw = result as unknown as { currentTier?: string };
      currentTier.value = raw?.currentTier ?? "free";

      // Check feature access based on plan constants.
      // This is a simplified client-side check. The real enforcement is server-side.
      const proFeatures = [
        "reports",
        "financial_dashboard",
        "crm_rfm_scoring",
        "ocr_verification",
        "ai_agents",
        "google_sheets_import",
      ];
      const businessFeatures = ["wakit_integration", "ai_autonomous", "public_api"];
      const starterFeatures = ["smart_feed"];

      if (businessFeatures.includes(feature)) {
        hasAccess.value = currentTier.value === "business";
        requiredTier.value = "business";
      } else if (proFeatures.includes(feature)) {
        hasAccess.value = ["pro", "business"].includes(currentTier.value);
        requiredTier.value = "pro";
      } else if (starterFeatures.includes(feature)) {
        hasAccess.value = ["starter", "pro", "business"].includes(currentTier.value);
        requiredTier.value = "starter";
      } else {
        hasAccess.value = true;
      }
    } catch {
      // If API fails, default to allowing access (don't block the UI).
      hasAccess.value = true;
    } finally {
      loading.value = false;
    }
  }

  onMounted(checkAccess);

  return { hasAccess, requiredTier, currentTier, loading };
}

/**
 * Owner Lock composable.
 *
 * Checks if the owner lock is active and whether the session is unlocked.
 * Redirects to /unlock if the lock is active and session is not unlocked.
 */
export function useOwnerLock() {
  const { get } = useApi();
  const router = useRouter();
  const route = useRoute();

  const lockEnabled = ref(false);
  const unlocked = ref(false);

  // Check if session is unlocked (15-minute window).
  const UNLOCK_DURATION_MS = 15 * 60 * 1000;

  function isSessionUnlocked(): boolean {
    const timestamp = sessionStorage.getItem("owner-unlocked");
    if (!timestamp) return false;
    const elapsed = Date.now() - parseInt(timestamp, 10);
    return elapsed < UNLOCK_DURATION_MS;
  }

  async function checkLock() {
    try {
      const result = await get<{ enabled: boolean }>("/owner-lock/status");
      const raw = result as unknown as { enabled?: boolean };
      lockEnabled.value = raw?.enabled ?? false;
      unlocked.value = isSessionUnlocked();
    } catch {
      lockEnabled.value = false;
    }
  }

  function requireUnlock() {
    if (lockEnabled.value && !unlocked.value) {
      router.push({ path: "/unlock", query: { returnTo: route.fullPath } });
    }
  }

  onMounted(async () => {
    await checkLock();
    requireUnlock();
  });

  return { lockEnabled, unlocked, checkLock, requireUnlock };
}
