"""
Nova Agents — Customer tools.

Tools for querying customer data, segments, and RFM scores via the Nova API.
Agents use these to identify at-risk customers, upsell opportunities, and
generate personalized recommendations.
"""

import json

from agno.tools import tool

from .api_client import api_get


@tool()
async def list_customers(
    tenant_id: str,
    search: str = "",
    segment: str = "",
    limit: int = 20,
) -> str:
    """List customers for the merchant with optional filtering.

    Args:
        tenant_id: The merchant's tenant ID.
        search: Optional search term to filter by name or phone.
        segment: Optional RFM segment filter (e.g., "champions", "at_risk", "hibernating").
        limit: Maximum number of customers to return (1-100). Defaults to 20.

    Returns:
        JSON string with customer list including name, segment, order count, and total spent.
    """
    params: dict[str, str | int] = {"limit": limit, "offset": 0}
    if search:
        params["search"] = search
    if segment:
        params["segment"] = segment

    try:
        result = await api_get("/customers", tenant_id, params=params)
        customers = result.get("data", [])
        summary = []
        for c in customers:
            summary.append(
                {
                    "id": c.get("id"),
                    "name": c.get("name"),
                    "phone": c.get("phone"),
                    "segment": c.get("segment"),
                    "orderCount": c.get("orderCount"),
                    "totalSpentUsd": c.get("totalSpentUsd"),
                    "lastOrderAt": c.get("lastOrderAt"),
                    "tags": c.get("tags", []),
                }
            )
        total = result.get("total", len(summary))
        return json.dumps({"customers": summary, "total": total}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool()
async def get_customer_details(tenant_id: str, customer_id: str) -> str:
    """Get detailed information about a specific customer.

    Args:
        tenant_id: The merchant's tenant ID.
        customer_id: The UUID of the customer.

    Returns:
        JSON string with full customer profile including RFM scores, order history summary,
        and behavioral data.
    """
    try:
        result = await api_get(f"/customers/{customer_id}", tenant_id)
        customer = result.get("data", result)
        return json.dumps(customer, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool()
async def get_at_risk_customers(tenant_id: str) -> str:
    """Get customers in the "at_risk" or "hibernating" RFM segments.

    These are customers who used to buy frequently but have slowed down or stopped.
    The merchant should re-engage them before they churn.

    Args:
        tenant_id: The merchant's tenant ID.

    Returns:
        JSON string with at-risk customers, their last order date, and total spent.
    """
    try:
        at_risk = await api_get(
            "/customers",
            tenant_id,
            params={"segment": "at_risk", "limit": 50, "offset": 0},
        )
        hibernating = await api_get(
            "/customers",
            tenant_id,
            params={"segment": "hibernating", "limit": 50, "offset": 0},
        )

        customers = []
        for c in at_risk.get("data", []) + hibernating.get("data", []):
            customers.append(
                {
                    "id": c.get("id"),
                    "name": c.get("name"),
                    "phone": c.get("phone"),
                    "segment": c.get("segment"),
                    "totalSpentUsd": c.get("totalSpentUsd"),
                    "lastOrderAt": c.get("lastOrderAt"),
                    "orderCount": c.get("orderCount"),
                }
            )

        return json.dumps(
            {"atRiskCustomers": customers, "count": len(customers)},
            ensure_ascii=False,
        )
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool()
async def get_top_customers(tenant_id: str, limit: int = 10) -> str:
    """Get the merchant's top customers by total spending (champions segment).

    Args:
        tenant_id: The merchant's tenant ID.
        limit: Number of top customers to return. Defaults to 10.

    Returns:
        JSON string with top customers ranked by total spent.
    """
    try:
        result = await api_get(
            "/customers",
            tenant_id,
            params={"segment": "champions", "limit": limit, "offset": 0},
        )
        customers = result.get("data", [])
        summary = [
            {
                "name": c.get("name"),
                "totalSpentUsd": c.get("totalSpentUsd"),
                "orderCount": c.get("orderCount"),
                "lastOrderAt": c.get("lastOrderAt"),
            }
            for c in customers
        ]
        return json.dumps(
            {"topCustomers": summary, "count": len(summary)}, ensure_ascii=False
        )
    except Exception as e:
        return json.dumps({"error": str(e)})
