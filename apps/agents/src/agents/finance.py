"""
Finance Agent — "The Accountant".

Capabilities:
    - OCR payment screenshots (extract amount, reference, bank)
    - Generate daily financial briefing
    - Alert on negative-margin products

Uses OpenRouter with a vision-capable model for OCR tasks.
Stores sessions and memory in pg-agno via Agno's PostgreSQL storage.
"""

from agno.agent import Agent
from agno.models.openrouter import OpenRouter
from agno.db.postgres import PostgresDb
from agno.tools import tool

from ..config import AGNO_DB_URL, OPENROUTER_API_KEY, AGENTS_MODEL

# Shared database connection for agent storage.
db = PostgresDb(db_url=AGNO_DB_URL)

FINANCE_AGENT_INSTRUCTIONS = [
    "You are the Finance Agent for Nova, a commercial SaaS for Venezuelan merchants.",
    "You help merchants verify payments, understand their finances, and make better decisions.",
    "You speak Spanish (Venezuelan) by default. Be concise and practical.",
    "When verifying payment screenshots, extract: amount, reference number, bank name, date.",
    "For daily briefings, summarize: total sales, pending payments, top products, at-risk customers.",
    "Always format currency as USD with 2 decimals. Show Bs equivalent when available.",
    "Never invent data. If you can't extract information from a screenshot, say so clearly.",
]


@tool()
def verify_payment_screenshot(image_url: str) -> str:
    """Analyze a payment screenshot and extract transaction details.

    Args:
        image_url: URL of the payment screenshot (from Cloudflare R2).

    Returns:
        Extracted payment details: amount, reference, bank, date, and confidence level.
    """
    # The actual OCR happens via the LLM's vision capability.
    # This tool provides the structured prompt for the agent.
    return (
        f"Please analyze the payment screenshot at {image_url}. "
        "Extract and return as JSON: "
        '{"amount": "...", "currency": "USD|VES", "reference": "...", '
        '"bank": "...", "date": "...", "confidence": "high|medium|low", '
        '"notes": "any issues or observations"}'
    )


def create_finance_agent() -> Agent:
    """Create and return the Finance Agent instance."""
    return Agent(
        id="finance-agent",
        name="Finance Agent",
        model=OpenRouter(
            id=AGENTS_MODEL,
            api_key=OPENROUTER_API_KEY,
        ),
        db=db,
        tools=[verify_payment_screenshot],
        instructions=FINANCE_AGENT_INSTRUCTIONS,
        add_history_to_context=True,
        num_history_runs=5,
        markdown=True,
    )
