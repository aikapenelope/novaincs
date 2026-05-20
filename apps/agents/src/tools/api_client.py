"""
Nova Agents — Internal API client.

HTTP client for querying the Nova API (Hono) from within agents.
Uses httpx for async requests. All calls are scoped to a tenant via
the X-Tenant-Id header (internal service-to-service, no Clerk auth needed).

The API trusts internal callers on the Docker network. A shared secret
(NOVA_INTERNAL_SECRET) is used to bypass Clerk auth middleware.
"""

import os
from typing import Any

import httpx

from ..config import NOVA_API_URL

# Internal service secret — bypasses Clerk auth for agent-to-API calls.
_INTERNAL_SECRET = os.environ.get("NOVA_INTERNAL_SECRET", "")

# Shared httpx client (connection pooling).
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    """Get or create the shared httpx client."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=NOVA_API_URL,
            timeout=httpx.Timeout(30.0, connect=5.0),
            headers={
                "Content-Type": "application/json",
                "X-Internal-Service": "nova-agents",
                "Authorization": f"Bearer {_INTERNAL_SECRET}"
                if _INTERNAL_SECRET
                else "",
            },
        )
    return _client


async def api_get(
    path: str,
    tenant_id: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """GET request to the Nova API scoped to a tenant.

    Args:
        path: API path (e.g., "/products").
        tenant_id: The merchant's tenant ID for RLS scoping.
        params: Optional query parameters.

    Returns:
        Parsed JSON response as a dictionary.

    Raises:
        httpx.HTTPStatusError: If the API returns a non-2xx status.
    """
    client = _get_client()
    response = await client.get(
        path,
        params=params,
        headers={"X-Tenant-Id": tenant_id},
    )
    response.raise_for_status()
    return response.json()  # type: ignore[no-any-return]


async def api_post(
    path: str,
    tenant_id: str,
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """POST request to the Nova API scoped to a tenant.

    Args:
        path: API path (e.g., "/orders").
        tenant_id: The merchant's tenant ID for RLS scoping.
        json_body: Optional JSON body.

    Returns:
        Parsed JSON response as a dictionary.

    Raises:
        httpx.HTTPStatusError: If the API returns a non-2xx status.
    """
    client = _get_client()
    response = await client.post(
        path,
        json=json_body,
        headers={"X-Tenant-Id": tenant_id},
    )
    response.raise_for_status()
    return response.json()  # type: ignore[no-any-return]


async def api_patch(
    path: str,
    tenant_id: str,
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """PATCH request to the Nova API scoped to a tenant.

    Args:
        path: API path (e.g., "/orders/:id").
        tenant_id: The merchant's tenant ID for RLS scoping.
        json_body: Optional JSON body.

    Returns:
        Parsed JSON response as a dictionary.

    Raises:
        httpx.HTTPStatusError: If the API returns a non-2xx status.
    """
    client = _get_client()
    response = await client.patch(
        path,
        json=json_body,
        headers={"X-Tenant-Id": tenant_id},
    )
    response.raise_for_status()
    return response.json()  # type: ignore[no-any-return]
