/**
 * Tenant context composable.
 *
 * Reads the tenant slug from the URL route parameter (:tenantSlug).
 * All catalog pages live under /t/:tenantSlug/... so this is always available.
 *
 * Also fetches store info from the API on first use and caches it.
 */

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
}

export function useTenant() {
  const route = useRoute();
  const { get } = useApi();

  const slug = computed(() => route.params.tenantSlug as string);

  // Cache store info per slug.
  const store = useState<TenantInfo | null>(`tenant-${slug.value}`, () => null);
  const storeError = useState<string | null>(`tenant-error-${slug.value}`, () => null);

  async function fetchStore() {
    if (store.value?.slug === slug.value) return;
    try {
      store.value = await get<TenantInfo>(`/catalog/${slug.value}`);
      storeError.value = null;
    } catch {
      storeError.value = "Tienda no encontrada";
      store.value = null;
    }
  }

  return {
    slug,
    store,
    storeError,
    fetchStore,
  };
}
