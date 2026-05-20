"""
Nova Agents — Order tools.

Tools for querying and managing orders via the Nova API.
Agents use these to check pending payments, order status, and sales data.
"""

import json

from agno.tools import tool

from .api_client import api_get, api_patch


@tool()
async def list_orders(
    tenant_id: str,
    status: str = "",
    limit: int = 20,
) -> str:
    """List recent orders for the merchant.

    Args:
        tenant_id: The merchant's tenant ID.
        status: Filter by status (e.g., "payment_pending", "verified", "delivered"). Empty for all.
        limit: Maximum number of orders to return (1-100). Defaults to 20.

    Returns:
        JSON string with order list including buyer, total, status, and date.
    """
    params: dict[str, str | int] = {"limit": limit, "offset": 0}
    if status:
        params["status"] = status

    try:
        result = await api_get("/orders", tenant_id, params=params)
        orders = result.get("data", [])
        summary = []
        for o in orders:
            summary.append(
                {
                    "id": o.get("id"),
                    "buyerName": o.get("buyerName"),
                    "totalUsd": o.get("totalUsd"),
                    "totalBs": o.get("totalBs"),
                    "status": o.get("status"),
                    "paymentMethod": o.get("paymentMethod"),
                    "createdAt": o.get("createdAt"),
                    "itemCount": len(o.get("items", [])),
                }
            )
        total = result.get("total", len(summary))
        return json.dumps({"orders": summary, "total": total}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool()
async def get_order_details(tenant_id: str, order_id: str) -> str:
    """Get full details of a specific order including items and payment info.

    Args:
        tenant_id: The merchant's tenant ID.
        order_id: The UUID of the order.

    Returns:
        JSON string with complete order details, items, and payment status.
    """
    try:
        result = await api_get(f"/orders/{order_id}", tenant_id)
        order = result.get("data", result)
        return json.dumps(order, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool()
async def get_pending_payments(tenant_id: str) -> str:
    """Get all orders with pending payment verification.

    Args:
        tenant_id: The merchant's tenant ID.

    Returns:
        JSON string with orders awaiting payment verification, grouped by age.
    """
    try:
        result = await api_get(
            "/orders",
            tenant_id,
            params={"status": "payment_pending", "limit": 50, "offset": 0},
        )
        orders = result.get("data", [])

        # Also get screenshot_uploaded orders.
        result_screenshots = await api_get(
            "/orders",
            tenant_id,
            params={"status": "screenshot_uploaded", "limit": 50, "offset": 0},
        )
        screenshot_orders = result_screenshots.get("data", [])

        pending = []
        for o in orders + screenshot_orders:
            pending.append(
                {
                    "id": o.get("id"),
                    "buyerName": o.get("buyerName"),
                    "totalUsd": o.get("totalUsd"),
                    "status": o.get("status"),
                    "paymentMethod": o.get("paymentMethod"),
                    "createdAt": o.get("createdAt"),
                }
            )

        return json.dumps(
            {"pendingPayments": pending, "count": len(pending)},
            ensure_ascii=False,
        )
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool()
async def update_order_status(tenant_id: str, order_id: str, new_status: str) -> str:
    """Update the status of an order (e.g., mark as verified after payment check).

    Args:
        tenant_id: The merchant's tenant ID.
        order_id: The UUID of the order to update.
        new_status: New status. One of: "verified", "rejected", "preparing", "shipped", "delivered".

    Returns:
        JSON string confirming the update or an error message.
    """
    valid_statuses = {
        "verified",
        "rejected",
        "preparing",
        "shipped",
        "delivered",
        "cancelled",
    }
    if new_status not in valid_statuses:
        return json.dumps(
            {"error": f"Invalid status. Must be one of: {sorted(valid_statuses)}"}
        )

    try:
        result = await api_patch(
            f"/orders/{order_id}/status",
            tenant_id,
            json_body={"status": new_status},
        )
        return json.dumps(
            {"success": True, "order": result.get("data", result)}, ensure_ascii=False
        )
    except Exception as e:
        return json.dumps({"error": str(e)})
