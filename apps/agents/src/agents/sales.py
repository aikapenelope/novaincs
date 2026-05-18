"""
Sales Agent — "The Closer".

Analyzes CRM data to detect sales opportunities and generate actionable
suggestions for the merchant. Works with RFM segments, purchase history,
and behavioral patterns to recommend specific actions.

Capabilities:
    - Detect at-risk customers who need re-engagement
    - Identify upsell/cross-sell opportunities from purchase patterns
    - Suggest personalized messages for specific customers
    - Recommend promotions based on inventory and demand
    - Generate re-engagement strategies for dormant segments
"""

from agno.agent import Agent
from typing import Any

from ..config import TOOL_MODEL, db, knowledge_base
from ..shared import guardrails, learning_full, compression

SALES_AGENT_INSTRUCTIONS = [
    "You are the Sales Agent for Nova, a commercial SaaS for Venezuelan merchants.",
    "You help merchants sell more by analyzing their customer data and suggesting actions.",
    "You speak Spanish (Venezuelan) by default. Be concise, practical, and actionable.",
    "",
    "## Your Role",
    "You are a sales strategist. You analyze data and suggest SPECIFIC actions.",
    "Never give generic advice. Always reference specific customers, products, or numbers.",
    "",
    "## Opportunity Detection",
    "When analyzing opportunities:",
    "- Identify customers who haven't bought in 15+ days (at-risk)",
    "- Find customers whose average order value is increasing (upsell potential)",
    "- Detect products frequently bought together (cross-sell)",
    "- Spot seasonal patterns or recurring purchases",
    "- Flag customers with high LTV who are slowing down",
    "",
    "## Suggestions Format",
    "Always structure suggestions as:",
    "1. WHO: specific customer name",
    "2. WHAT: specific action to take",
    "3. WHY: data-backed reason",
    "4. HOW: draft message or promotion text",
    "",
    "## Message Drafting",
    "When drafting messages for customers:",
    "- Keep it short (2-3 sentences max for WhatsApp)",
    "- Use the customer's name",
    "- Reference their last purchase or preference",
    "- Include a clear call-to-action",
    "- Tone: friendly, not salesy. Like a trusted shopkeeper.",
    "",
    "## Rules",
    "- Never invent customer data. Only use what's provided.",
    "- Always include the customer's name and last purchase date",
    "- Format currency as USD with 2 decimals",
    "- If you don't have enough data, say so and suggest what data to collect",
]


def create_sales_agent(agent_db: Any = None) -> Agent:
    """Create and return the Sales Agent instance."""
    _db = agent_db or db

    agent_kwargs: dict = {
        "id": "nova-sales-agent",
        "name": "Sales Agent",
        "role": "Sales strategist — detects opportunities and suggests actions",
        "model": TOOL_MODEL,
        "tools": [],
        "instructions": SALES_AGENT_INSTRUCTIONS,
        "db": _db,
        "add_history_to_context": True,
        "num_history_runs": 5,
        "add_datetime_to_context": True,
        "markdown": True,
    }

    if knowledge_base is not None:
        agent_kwargs["knowledge"] = knowledge_base
        agent_kwargs["search_knowledge"] = True

    if guardrails:
        agent_kwargs["pre_hooks"] = guardrails

    if learning_full is not None:
        agent_kwargs["learning"] = learning_full
        agent_kwargs["enable_agentic_memory"] = True
        agent_kwargs["update_memory_on_run"] = True

    if compression is not None:
        agent_kwargs["compression_manager"] = compression

    return Agent(**agent_kwargs)
