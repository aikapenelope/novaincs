"""
Nova Agents — Financial tools.

Tools for querying revenue analytics, receivables, expenses, and cash flow
via the Nova API. Used primarily by the Finance Agent for daily briefings
and financial analysis.
"""

import json

from agno.tools import tool

from .api_client import api_get


@tool()
async def get_revenue_summary(tenant_id: str, days: int = 30) -> str:
    """Get revenue summary for a given period.

    Args:
        tenant_id: The merchant's tenant ID.
        days: Number of days to look back. Defaults to 30.

    Returns:
        JSON string with total revenue, order count, and daily breakdown.
    """
    try:
        result = await api_get("/analytics/revenue", tenant_id, params={"days": days})
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool()
async def get_top_products(tenant_id: str, days: int = 30, limit: int = 10) -> str:
    """Get top-selling products by revenue for a given period.

    Args:
        tenant_id: The merchant's tenant ID.
        days: Number of days to look back. Defaults to 30.
        limit: Number of top products to return. Defaults to 10.

    Returns:
        JSON string with top products ranked by revenue, including units sold.
    """
    try:
        result = await api_get(
            "/analytics/top-products", tenant_id, params={"days": days, "limit": limit}
        )
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool()
async def get_receivables(tenant_id: str) -> str:
    """Get accounts receivable summary (unpaid orders grouped by aging).

    Args:
        tenant_id: The merchant's tenant ID.

    Returns:
        JSON string with receivables grouped by aging buckets (0-7, 7-15, 15-30, 30+ days)
        and total outstanding amount.
    """
    try:
        result = await api_get("/receivables", tenant_id)
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool()
async def get_daily_stats(tenant_id: str) -> str:
    """Get today's sales statistics (revenue, orders, top product).

    Args:
        tenant_id: The merchant's tenant ID.

    Returns:
        JSON string with today's revenue (USD + Bs), order count, and top product.
    """
    try:
        result = await api_get("/analytics/revenue", tenant_id, params={"days": 1})
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool()
async def get_expenses(tenant_id: str, days: int = 30) -> str:
    """Get expense summary for a given period.

    Args:
        tenant_id: The merchant's tenant ID.
        days: Number of days to look back. Defaults to 30.

    Returns:
        JSON string with expenses grouped by category and total amount.
    """
    try:
        result = await api_get(
            "/expenses", tenant_id, params={"days": days, "limit": 100}
        )
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool()
async def get_cashflow(tenant_id: str, days: int = 30) -> str:
    """Get cash flow summary (inflows vs outflows) for a given period.

    Args:
        tenant_id: The merchant's tenant ID.
        days: Number of days to look back. Defaults to 30.

    Returns:
        JSON string with net cash flow, inflows (verified payments), and outflows (expenses).
    """
    try:
        result = await api_get("/cashflow", tenant_id, params={"days": days})
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool()
async def get_exchange_rate(tenant_id: str) -> str:
    """Get the current BCV exchange rate (USD to VES/Bs).

    Args:
        tenant_id: The merchant's tenant ID.

    Returns:
        JSON string with current rate, last updated timestamp, and source.
    """
    try:
        result = await api_get("/exchange-rates/current", tenant_id)
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})
