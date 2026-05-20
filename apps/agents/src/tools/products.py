"""
Nova Agents — Product tools.

Tools for querying the merchant's product catalog via the Nova API.
Agents use these to answer questions about inventory, pricing, and stock.
"""

import json

from agno.tools import tool

from .api_client import api_get


@tool()
async def list_products(
    tenant_id: str,
    search: str = "",
    status: str = "active",
    limit: int = 20,
) -> str:
    """List products from the merchant's catalog.

    Args:
        tenant_id: The merchant's tenant ID.
        search: Optional search term to filter by product name.
        status: Filter by status: "active", "draft", or "archived". Defaults to "active".
        limit: Maximum number of products to return (1-100). Defaults to 20.

    Returns:
        JSON string with product list including name, price, stock, and status.
    """
    params: dict[str, str | int] = {"limit": limit, "offset": 0}
    if search:
        params["search"] = search
    if status:
        params["status"] = status

    try:
        result = await api_get("/products", tenant_id, params=params)
        products = result.get("data", [])
        # Return a concise summary for the agent context.
        summary = []
        for p in products:
            summary.append(
                {
                    "id": p.get("id"),
                    "name": p.get("name"),
                    "priceUsd": p.get("priceUsd"),
                    "priceBs": p.get("priceBs"),
                    "stock": p.get("stock"),
                    "status": p.get("status"),
                    "sku": p.get("sku"),
                }
            )
        total = result.get("total", len(summary))
        return json.dumps({"products": summary, "total": total}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool()
async def get_product_details(tenant_id: str, product_id: str) -> str:
    """Get detailed information about a specific product.

    Args:
        tenant_id: The merchant's tenant ID.
        product_id: The UUID of the product.

    Returns:
        JSON string with full product details including variants, images, and metadata.
    """
    try:
        result = await api_get(f"/products/{product_id}", tenant_id)
        product = result.get("data", result)
        return json.dumps(product, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool()
async def search_low_stock_products(tenant_id: str, threshold: int = 5) -> str:
    """Find products with stock at or below a threshold.

    Args:
        tenant_id: The merchant's tenant ID.
        threshold: Stock level threshold. Products at or below this are returned. Defaults to 5.

    Returns:
        JSON string with low-stock products and their current levels.
    """
    try:
        # Get all active products and filter by stock level.
        result = await api_get(
            "/products",
            tenant_id,
            params={"status": "active", "limit": 100, "offset": 0},
        )
        products = result.get("data", [])
        low_stock = [
            {
                "id": p.get("id"),
                "name": p.get("name"),
                "stock": p.get("stock"),
                "priceUsd": p.get("priceUsd"),
            }
            for p in products
            if (p.get("stock") or 0) <= threshold
        ]
        low_stock.sort(key=lambda x: x.get("stock") or 0)
        return json.dumps(
            {
                "lowStockProducts": low_stock,
                "count": len(low_stock),
                "threshold": threshold,
            },
            ensure_ascii=False,
        )
    except Exception as e:
        return json.dumps({"error": str(e)})
