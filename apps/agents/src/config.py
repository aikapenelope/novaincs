"""
Configuration for Nova Agents.

All settings are loaded from environment variables. Required vars:
    AGNO_DB_URL         — PostgreSQL connection for agent memory/sessions (pg-agno)
    OPENROUTER_API_KEY  — OpenRouter API key for LLM access
    NOVA_API_URL        — Internal URL of the Node.js API (for data queries)

Optional:
    AGENTS_PORT         — Port to serve on (default: 8100)
    AGENTS_MODEL        — Default model ID (default: openai/gpt-4o-mini)
    GROQ_API_KEY        — Groq API key for fast/cheap tasks
"""

import os


def get_required_env(key: str) -> str:
    """Get a required environment variable or raise."""
    value = os.environ.get(key)
    if not value:
        raise RuntimeError(f"Required environment variable {key} is not set")
    return value


# Database (pg-agno)
AGNO_DB_URL: str = os.environ.get(
    "AGNO_DB_URL",
    "postgresql+psycopg://agno:agno_dev@localhost:5433/agno",
)

# LLM providers
OPENROUTER_API_KEY: str = os.environ.get("OPENROUTER_API_KEY", "")
GROQ_API_KEY: str = os.environ.get("GROQ_API_KEY", "")

# Default model for agents (via OpenRouter)
AGENTS_MODEL: str = os.environ.get("AGENTS_MODEL", "openai/gpt-4o-mini")

# Nova API (internal, for querying business data)
NOVA_API_URL: str = os.environ.get("NOVA_API_URL", "http://localhost:3000")

# Server
AGENTS_PORT: int = int(os.environ.get("AGENTS_PORT", "8100"))
