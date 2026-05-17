"""
Nova Agents — AI agent platform for Nova merchants.

Powered by Agno AgentOS. Runs as a standalone FastAPI service
that the Node.js API calls via HTTP on the Docker network.

Architecture:
    Dashboard → API (Hono) → nova-agents (Agno) → LLM (OpenRouter)
                                    ↓
                              pg-agno (PostgreSQL + pgvector)
"""
