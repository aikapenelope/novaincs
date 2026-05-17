"""
Nova Agents — Shared configuration.

Follows the same production pattern as qyne-v1:
- PostgreSQL for sessions/memory/traces (pg-agno)
- LanceDB for local vector storage (knowledge + learnings)
- OpenRouter for LLM access (multiple model tiers)
- Groq for fast/cheap tasks
- Knowledge base auto-indexed from knowledge/ folder
"""

import os
from pathlib import Path

from agno.models.openai import OpenAIChat
from agno.models.groq import Groq
from agno.knowledge.knowledge import Knowledge
from agno.vectordb.lancedb import LanceDb, SearchType

try:
    from agno.db.postgres import PostgresDb

    _postgres_available = True
except ImportError:
    PostgresDb = None  # type: ignore[assignment, misc]
    _postgres_available = False

try:
    from agno.db.sqlite import SqliteDb

    _sqlite_available = True
except ImportError:
    SqliteDb = None  # type: ignore[assignment, misc]
    _sqlite_available = False


def get_required_env(key: str) -> str:
    """Get a required environment variable or raise."""
    value = os.environ.get(key)
    if not value:
        raise RuntimeError(f"Required environment variable {key} is not set")
    return value


# ---------------------------------------------------------------------------
# Data directory (persistent volume in Docker)
# ---------------------------------------------------------------------------

DATA_DIR = Path(os.getenv("NOVA_DATA_DIR", "/app/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Database (PostgreSQL for production, SQLite fallback for dev)
# ---------------------------------------------------------------------------

_database_url = os.getenv(
    "AGNO_DB_URL",
    "postgresql+psycopg://agno:agno_dev@localhost:5433/agno",
)

if _database_url and _postgres_available and PostgresDb is not None:
    db = PostgresDb(db_url=_database_url)
else:
    if _sqlite_available and SqliteDb is not None:
        db = SqliteDb(db_file=str(DATA_DIR / "nova-agents.db"))  # type: ignore[assignment]
    else:
        raise RuntimeError("No database backend available (need psycopg or aiosqlite)")

# ---------------------------------------------------------------------------
# LLM Model Configuration (via OpenRouter)
# ---------------------------------------------------------------------------
# Three tiers matching doc 08 cost model:
#   FAST_MODEL:      cheap, fast (simple classification, entity extraction)
#   TOOL_MODEL:      workhorse (OCR, briefings, content, Q&A)
#   REASONING_MODEL: complex analysis (quarterly reviews, conflict resolution)

_openrouter_api_key = get_required_env("OPENROUTER_API_KEY")

FAST_MODEL = OpenAIChat(
    id=os.getenv("NOVA_FAST_MODEL", "openai/gpt-4o-mini"),
    api_key=_openrouter_api_key,
    base_url="https://openrouter.ai/api/v1",
)

TOOL_MODEL = OpenAIChat(
    id=os.getenv("NOVA_TOOL_MODEL", "openai/gpt-4o-mini"),
    api_key=_openrouter_api_key,
    base_url="https://openrouter.ai/api/v1",
)

REASONING_MODEL = OpenAIChat(
    id=os.getenv("NOVA_REASONING_MODEL", "openai/gpt-5-mini"),
    api_key=_openrouter_api_key,
    base_url="https://openrouter.ai/api/v1",
)

# Groq for ultra-fast tasks (voice parsing, intent detection).
GROQ_FAST_MODEL = Groq(id=os.getenv("NOVA_GROQ_MODEL", "llama-3.1-8b-instant"))

# ---------------------------------------------------------------------------
# Knowledge Base (LanceDB local vectors)
# ---------------------------------------------------------------------------
# LanceDB stores vectors locally (like SQLite for vectors).
# Drop .md/.txt/.pdf files into knowledge/ and they're indexed on startup.

KNOWLEDGE_DIR = Path(__file__).parent.parent / "knowledge"
KNOWLEDGE_DIR.mkdir(exist_ok=True)

try:
    from agno.knowledge.embedder.openai import OpenAIEmbedder

    embedder = OpenAIEmbedder(
        id="text-embedding-3-small",
        dimensions=512,
        api_key=_openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
    )
except Exception:
    embedder = None  # type: ignore[assignment]

if embedder is not None:
    vector_db = LanceDb(
        uri=str(DATA_DIR / "lancedb"),
        table_name="nova_knowledge",
        search_type=SearchType.hybrid,
        embedder=embedder,
    )

    knowledge_base = Knowledge(
        name="Nova Knowledge",
        description="Nova merchant platform documentation and reference material",
        vector_db=vector_db,
        contents_db=db,
    )

    # Learnings: separate table for what agents learn over time.
    learnings_db = LanceDb(
        uri=str(DATA_DIR / "lancedb"),
        table_name="nova_learnings",
        search_type=SearchType.hybrid,
        embedder=embedder,
    )

    learnings_knowledge = Knowledge(
        name="Nova Learnings",
        description="Accumulated agent learnings, patterns, and corrections",
        vector_db=learnings_db,
        contents_db=db,
    )

    # Auto-index knowledge files on startup.
    for file_path in sorted(KNOWLEDGE_DIR.iterdir()):
        if file_path.suffix.lower() in {".pdf", ".txt", ".md", ".csv", ".json"}:
            knowledge_base.insert(path=file_path, skip_if_exists=True)
else:
    knowledge_base = None  # type: ignore[assignment]
    learnings_knowledge = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Nova API (internal, for querying business data)
# ---------------------------------------------------------------------------

NOVA_API_URL: str = os.environ.get("NOVA_API_URL", "http://localhost:3000")

# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------

AGENTS_PORT: int = int(os.environ.get("AGENTS_PORT", "8100"))
