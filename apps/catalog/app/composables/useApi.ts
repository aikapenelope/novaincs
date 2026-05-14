/**
 * Composable for making typed API calls to the Qyne backend.
 * Uses Nuxt's $fetch with the configured API URL.
 */
export function useApi() {
  const config = useRuntimeConfig();
  const apiUrl = config.public.apiUrl;

  async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, apiUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    const response = await $fetch<{ data: T }>(url.toString());
    return response.data;
  }

  return { get, apiUrl };
}
