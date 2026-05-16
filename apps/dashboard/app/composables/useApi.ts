/**
 * Composable for making authenticated API calls to the Qyne backend.
 *
 * Uses Clerk's useAuth() to get the real session token and the user's
 * tenant membership to resolve the tenant ID. No placeholders.
 */
export function useApi() {
  const config = useRuntimeConfig();
  const apiUrl = config.public.apiUrl;

  const { getToken } = useAuth();

  const tenantId = useState<string | null>("current-tenant-id", () => null);

  async function getHeaders(): Promise<Record<string, string>> {
    const tokenFn = getToken.value;
    const token = tokenFn ? await tokenFn() : null;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (tenantId.value) {
      headers["X-Tenant-Id"] = tenantId.value;
    }
    return headers;
  }

  async function get<T>(path: string): Promise<T> {
    const headers = await getHeaders();
    const response = await $fetch<{ data: T }>(`${apiUrl}${path}`, { headers });
    return response.data;
  }

  async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const headers = await getHeaders();
    const response = await $fetch<{ data: T }>(`${apiUrl}${path}`, {
      method: "POST",
      headers,
      body,
    });
    return response.data;
  }

  async function patch<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const headers = await getHeaders();
    const response = await $fetch<{ data: T }>(`${apiUrl}${path}`, {
      method: "PATCH",
      headers,
      body,
    });
    return response.data;
  }

  async function del<T>(path: string): Promise<T> {
    const headers = await getHeaders();
    const response = await $fetch<{ data: T }>(`${apiUrl}${path}`, {
      method: "DELETE",
      headers,
    });
    return response.data;
  }

  async function upload<T>(path: string, formData: FormData): Promise<T> {
    const tokenFn = getToken.value;
    const token = tokenFn ? await tokenFn() : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (tenantId.value) {
      headers["X-Tenant-Id"] = tenantId.value;
    }
    const response = await $fetch<{ data: T }>(`${apiUrl}${path}`, {
      method: "POST",
      headers,
      body: formData,
    });
    return response.data;
  }

  async function resolveTenant(): Promise<void> {
    if (tenantId.value) return;
    try {
      const tenant = await get<{ id: string }>("/tenants/me");
      tenantId.value = tenant.id;
    } catch {
      tenantId.value = null;
    }
  }

  return { get, post, patch, del, upload, apiUrl, tenantId, resolveTenant };
}
