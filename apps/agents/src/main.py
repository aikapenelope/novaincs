"""
Nova Agents — AgentOS Entry Point.

Production-grade agent platform following the same pattern as qyne-v1.
Runs as a FastAPI service with sessions, memory, tracing, and scheduling.

Usage:
    uvicorn src.main:app --host 0.0.0.0 --port 8100
"""

from typing import Any

from fastapi import FastAPI
from agno.os import AgentOS

from .config import db, knowledge_base, AGENTS_PORT
from .agents.finance import create_finance_agent

# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------

finance_agent = create_finance_agent(agent_db=db)

_all_agents: list[Any] = [
    finance_agent,
]

# ---------------------------------------------------------------------------
# Custom FastAPI app (health check + agent listing)
# ---------------------------------------------------------------------------

base_app = FastAPI(
    title="Nova Agents",
    description="AI agents for Nova merchants — powered by Agno AgentOS",
    version="0.1.0",
)


@base_app.get("/health")
async def health() -> dict[str, str]:
    """Health check for container orchestration (Coolify/Docker)."""
    return {"status": "ok", "service": "nova-agents"}


@base_app.get("/agents")
async def list_agents() -> dict[str, list[dict[str, str]]]:
    """List available agents and their capabilities."""
    return {
        "agents": [
            {
                "id": a.id or "unknown",
                "name": a.name or "unnamed",
                "role": getattr(a, "role", "") or "",
                "status": "active",
            }
            for a in _all_agents
        ]
    }


# ---------------------------------------------------------------------------
# AgentOS
# ---------------------------------------------------------------------------

_knowledge: list[Any] = [knowledge_base] if knowledge_base is not None else []

agent_os = AgentOS(
    id="nova",
    description="Nova — AI agents for Venezuelan merchants",
    agents=_all_agents,
    teams=[],
    workflows=[],
    knowledge=_knowledge or None,
    base_app=base_app,
    on_route_conflict="preserve_base_app",
    db=db,
    tracing=True,
    scheduler=True,
    scheduler_poll_interval=60,
)

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
