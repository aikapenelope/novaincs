/**
 * Composable for making authenticated API calls to the Qyne backend.
 * Includes the Authorization and X-Tenant-Id headers automatically.
 *
 * TODO: Wire up real Clerk token and tenant ID from auth state.
 * For now, uses placeholder values for development.
 */
export function useApi() {
  const config = useRuntimeConfig();
  const apiUrl = config.public.apiUrl;

  // TODO: Replace with real Clerk session token.
  const authToken = "dev-placeholder-token";
  // TODO: Replace with real tenant ID from auth state.
  const tenantId = "dev-placeholder-tenant";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${authToken}`,
    "X-Tenant-Id": tenantId,
    "Content-Type": "application/json",
  };

  async function get<T>(path: string): Promise<T> {
    const response = await $fetch<{ data: T }>(`${apiUrl}${path}`, { headers });
    return response.data;
  }

  async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await $fetch<{ data: T }>(`${apiUrl}${path}`, {
      method: "POST",
      headers,
      body,
    });
    return response.data;
  }

  async function patch<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await $fetch<{ data: T }>(`${apiUrl}${path}`, {
      method: "PATCH",
      headers,
      body,
    });
    return response.data;
  }

  async function del<T>(path: string): Promise<T> {
    const response = await $fetch<{ data: T }>(`${apiUrl}${path}`, {
      method: "DELETE",
      headers,
    });
    return response.data;
  }

  return { get, post, patch, del, apiUrl, authToken, tenantId };
}
