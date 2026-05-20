"""
Finance Agent — "The Accountant".

Production-grade agent for Nova merchants:
    - OCR payment screenshots (extract amount, reference, bank)
    - Generate daily financial briefing
    - Alert on negative-margin products
    - Accounts receivable tracking

Uses OpenRouter with a vision-capable model for OCR tasks.
Stores sessions and memory in pg-agno via Agno's PostgreSQL storage.
Follows the same production pattern as qyne-v1 agents.
"""

from typing import Any

from agno.agent import Agent
from agno.tools import tool

from ..config import (
    TOOL_MODEL,
    db,
    knowledge_base,
)
from ..shared import guardrails, learning_full, compression
from ..tools.finance import (
    get_cashflow,
    get_daily_stats,
    get_exchange_rate,
    get_expenses,
    get_receivables,
    get_revenue_summary,
    get_top_products,
)
from ..tools.orders import get_pending_payments, list_orders, update_order_status

FINANCE_AGENT_INSTRUCTIONS = [
    "You are the Finance Agent for Nova, a commercial SaaS for Venezuelan merchants.",
    "You help merchants verify payments, understand their finances, and make better decisions.",
    "You speak Spanish (Venezuelan) by default. Be concise and practical.",
    "",
    "## Payment Verification (OCR)",
    "When verifying payment screenshots:",
    "- Extract: amount, reference number, bank name, date",
    "- Identify payment method: Pago Movil, Zelle, or bank transfer",
    "- Flag suspicious screenshots (edited, blurry, mismatched amounts)",
    "- Return structured JSON with confidence level",
    "",
    "## Daily Briefing",
    "For daily briefings, summarize:",
    "- Total sales yesterday (USD + Bs)",
    "- Pending payment verifications",
    "- Top 3 products by revenue",
    "- Customers at risk (from RFM segments)",
    "- Any negative-margin products",
    "",
    "## Financial Rules",
    "- Always format currency as USD with 2 decimals",
    "- Show Bs equivalent when available (use current BCV rate)",
    "- Never invent data. If you can't extract info, say so clearly",
    "- For margin calculations: margin = (price - cost) / price * 100",
    "",
    "## Accounts Receivable",
    "- Track orders with status 'payment_pending' or 'verifying'",
    "- Group by aging: 0-7 days, 7-15 days, 15-30 days, 30+ days",
    "- Flag orders approaching expiration",
]


@tool()
def verify_payment_screenshot(image_url: str) -> str:
    """Analyze a payment screenshot and extract transaction details.

    Args:
        image_url: URL of the payment screenshot (from Cloudflare R2).

    Returns:
        Extracted payment details: amount, reference, bank, date, and confidence level.
    """
    return (
        f"Please analyze the payment screenshot at {image_url}. "
        "Extract and return as JSON: "
        '{"amount": "...", "currency": "USD|VES", "reference": "...", '
        '"bank": "...", "date": "...", "payment_method": "pago_movil|zelle|transfer", '
        '"confidence": "high|medium|low", '
        '"notes": "any issues or observations"}'
    )


def create_finance_agent(agent_db: Any = None) -> Agent:
    """Create and return the Finance Agent instance.

    Args:
        agent_db: Optional shared database instance. Falls back to module-level db.
    """
    _db = agent_db or db

    agent_kwargs: dict = {
        "id": "nova-finance-agent",
        "name": "Finance Agent",
        "role": "Financial analyst and payment verifier for Nova merchants",
        "model": TOOL_MODEL,
        "tools": [
            verify_payment_screenshot,
            get_revenue_summary,
            get_top_products,
            get_receivables,
            get_daily_stats,
            get_expenses,
            get_cashflow,
            get_exchange_rate,
            get_pending_payments,
            list_orders,
            update_order_status,
        ],
        "tool_call_limit": 8,
        "retries": 2,
        "instructions": FINANCE_AGENT_INSTRUCTIONS,
        "db": _db,
        "add_history_to_context": True,
        "num_history_runs": 5,
        "add_datetime_to_context": True,
        "markdown": True,
    }

    # Add knowledge base if available.
    if knowledge_base is not None:
        agent_kwargs["knowledge"] = knowledge_base
        agent_kwargs["search_knowledge"] = True

    # Add guardrails (PII masking for bank details in screenshots).
    if guardrails:
        agent_kwargs["pre_hooks"] = guardrails

    # Add learning (agents improve over time).
    if learning_full is not None:
        agent_kwargs["learning"] = learning_full
        agent_kwargs["enable_agentic_memory"] = True
        agent_kwargs["update_memory_on_run"] = True

    # Add compression (save tokens on long tool results).
    if compression is not None:
        agent_kwargs["compression_manager"] = compression

    return Agent(**agent_kwargs)
