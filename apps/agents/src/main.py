"""
Nova Agents — Main application entry point.

Runs Agno AgentOS as a FastAPI service exposing all Nova agents
via a production API with sessions, memory, and tracing.

Usage:
    uvicorn src.main:app --host 0.0.0.0 --port 8100
    # or
    python -m src.main
"""

from fastapi import FastAPI
from agno.os import AgentOS
from agno.db.postgres import PostgresDb

from .config import AGNO_DB_URL, AGENTS_PORT
from .agents.finance import create_finance_agent

# Shared database for AgentOS (sessions, memory, traces).
db = PostgresDb(db_url=AGNO_DB_URL)

# Create agent instances (pass shared db to avoid duplicate pools).
finance_agent = create_finance_agent(db)

# --- Custom health/status endpoints ---

custom_app = FastAPI(
    title="Nova Agents",
    description="AI agents for Nova merchants",
    version="0.1.0",
)


@custom_app.get("/health")
async def health() -> dict[str, str]:
    """Health check for container orchestration (Coolify/Docker)."""
    return {"status": "ok", "service": "nova-agents"}


@custom_app.get("/agents")
async def list_agents() -> dict[str, list[dict[str, str]]]:
    """List available agents and their capabilities."""
    return {
        "agents": [
            {
                "id": "finance-agent",
                "name": "Finance Agent",
                "description": "Payment OCR, daily briefings, financial alerts",
                "status": "active",
            },
        ]
    }


# --- AgentOS setup ---

agent_os = AgentOS(
    agents=[finance_agent],
    db=db,
    base_app=custom_app,
    on_route_conflict="preserve_base_app",
)

# The ASGI app that uvicorn serves.
app = agent_os.get_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=AGENTS_PORT,
        reload=False,
        log_level="info",
    )
