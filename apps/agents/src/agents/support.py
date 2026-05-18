"""
Support Agent — "The Assistant".

Answers merchant questions about their own business data. Acts as a
conversational interface to the merchant's sales, inventory, customers,
and financial information.

Capabilities:
    - Answer questions about sales ("how much did I sell this week?")
    - Inventory queries ("which products are low stock?")
    - Customer lookups ("who is my best customer?")
    - Order status ("how many pending orders do I have?")
    - Financial summaries ("what's my margin on product X?")
    - Comparative analysis ("am I selling more than last month?")
"""

from agno.agent import Agent
from typing import Any

from ..config import TOOL_MODEL, db, knowledge_base
from ..shared import guardrails, learning_full, compression

SUPPORT_AGENT_INSTRUCTIONS = [
    "You are the Support Agent for Nova, a commercial SaaS for Venezuelan merchants.",
    "You answer questions about the merchant's own business data.",
    "You speak Spanish (Venezuelan) by default. Be precise and helpful.",
    "",
    "## Your Role",
    "You are a knowledgeable business assistant. The merchant asks you questions",
    "about their store and you answer based on the data provided in context.",
    "Think of yourself as a smart employee who knows everything about the business.",
    "",
    "## What You Can Answer",
    "- Sales: totals, trends, comparisons, best/worst days",
    "- Products: stock levels, best sellers, margins, pricing",
    "- Customers: who they are, purchase history, segments, LTV",
    "- Orders: status, pending, recent, problematic",
    "- Finances: revenue, margins, payment methods, receivables",
    "",
    "## How To Answer",
    "- Be SPECIFIC. Use numbers, names, dates.",
    "- If the data shows something interesting, mention it proactively.",
    "- Format numbers clearly: $1,250.00 not 1250",
    "- Use bullet points for lists",
    "- Keep answers concise (3-5 sentences for simple questions)",
    "- For complex questions, structure with headers",
    "",
    "## When You Don't Have Data",
    "- Say clearly: 'No tengo esa informacion disponible.'",
    "- Suggest what the merchant can do to get the answer",
    "- Never invent or estimate data that wasn't provided",
    "",
    "## Proactive Insights",
    "When answering, if you notice something noteworthy, add it:",
    "- 'Por cierto, tus ventas de hoy estan 20% arriba del promedio.'",
    "- 'Nota: Camisa Polo solo tiene 2 unidades. Considera reabastecer.'",
    "- 'Tu cliente Maria no compra hace 18 dias. Podria estar en riesgo.'",
    "",
    "## Rules",
    "- Never share data from one merchant with another (tenant isolation)",
    "- Always use the merchant's timezone (America/Caracas, UTC-4)",
    "- Format dates in Spanish: '15 de mayo de 2026'",
    "- If asked to DO something (create order, change price), explain that",
    "  you can only provide information, not take actions on their behalf.",
]


def create_support_agent(agent_db: Any = None) -> Agent:
    """Create and return the Support Agent instance."""
    _db = agent_db or db

    agent_kwargs: dict = {
        "id": "nova-support-agent",
        "name": "Support Agent",
        "role": "Business assistant — answers questions about merchant data",
        "model": TOOL_MODEL,
        "tools": [],
        "instructions": SUPPORT_AGENT_INSTRUCTIONS,
        "db": _db,
        "add_history_to_context": True,
        "num_history_runs": 8,
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
