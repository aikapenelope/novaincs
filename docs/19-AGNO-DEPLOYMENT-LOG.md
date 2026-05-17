# Nova — Agno AgentOS Deployment Log

> **Date**: May 17, 2026
> **Scope**: Complete record of deploying Agno AgentOS to production on Coolify/Hetzner, including every problem encountered and how it was resolved.

---

## Final Architecture

```
Dashboard (Nuxt :3001) → API (Hono :3000) → nova-agents (Agno :8100) → OpenRouter → LLM
                                                    ↓
                                              pg-agno (PostgreSQL 16 + pgvector)
```

- **Container**: `mus58v20w2rpk4ydn9sdodp7` on Coolify
- **Image**: python:3.12-slim + Agno 2.6.7
- **Memory**: ~163 MB
- **Port**: 8100 (internal, no public domain)
- **Network**: `coolify` (same as API and Dashboard)

---

## Problems Encountered & Solutions

### 1. Missing `fastapi` dependency

**Error**: `ModuleNotFoundError: No module named 'fastapi'`

**Cause**: The base `agno` package does not include FastAPI. It's an optional dependency under the `agno[os]` extra.

**Solution**: Changed from `agno` to `agno[os]` in pyproject.toml. The `[os]` extra includes: fastapi, uvicorn, sqlalchemy, PyJWT, OpenTelemetry.

**Lesson**: Agno is heavily modular. The base package is minimal. Always use `agno[os]` for AgentOS deployments.

### 2. Missing `sqlalchemy` dependency

**Error**: `ImportError: sqlalchemy not installed. Please install it using pip install sqlalchemy`

**Cause**: `agno.db.postgres` requires sqlalchemy internally, but it's not a direct dependency of `agno` or `agno[postgres]`. It's only included in `agno[os]` and `agno[sqlite]`.

**Solution**: Using `agno[os]` resolved this since it includes sqlalchemy.

**Lesson**: The `agno[postgres]` extra only installs `psycopg-binary` (the driver), not sqlalchemy (the ORM that Agno uses internally). You need `agno[os]` for the full storage stack.

### 3. Docker build context wrong

**Error**: `lstat /artifacts/.../apps/agents: no such file or directory`

**Cause**: Coolify was building from the repo root, but the Dockerfile and source are in `apps/agents/`.

**Solution**: Set **Base Directory** to `apps/agents` and **Dockerfile Location** to `Dockerfile` (relative to base directory) in Coolify.

**Lesson**: When deploying a subdirectory of a monorepo in Coolify, the Base Directory must point to the subdirectory. The Dockerfile Location is then relative to that base.

### 4. Healthcheck fails with `405 Method Not Allowed`

**Error**: `HEAD /health HTTP/1.1" 405 Method Not Allowed` (repeated)

**Cause**: The Dockerfile used `wget --spider` for the healthcheck, which sends a `HEAD` request. AgentOS/FastAPI only registers `GET /health`, not `HEAD`. Coolify also uses `HEAD` for its own health checks.

**Solution**: Changed healthcheck from `wget --spider` to `curl -sf` which sends a `GET` request.

```dockerfile
# Before (broken):
HEALTHCHECK CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8100/health || exit 1

# After (working):
HEALTHCHECK CMD curl -sf http://127.0.0.1:8100/health || exit 1
```

**Lesson**: FastAPI does not automatically handle HEAD requests for routes defined with `@app.get()`. Always use `curl -sf` (GET) instead of `wget --spider` (HEAD) for FastAPI healthchecks.

### 5. Healthcheck timeout too short

**Error**: Container marked unhealthy before it finished starting.

**Cause**: Default healthcheck start_period was 30s. Agno takes ~15-20s to initialize (create PostgreSQL tables, index knowledge files, set up LanceDB). Combined with Coolify's own health check timing, 30s wasn't enough.

**Solution**: Increased healthcheck parameters:
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5
```

Also configured in Coolify UI: Health Check Start Period = 120s.

**Lesson**: Agno AgentOS is not a lightweight service. It initializes database tables, vector stores, and knowledge indexes on startup. Allow at least 60s start period.

### 6. OpenRouter doesn't support embeddings

**Error**: `Failed to get embedding and usage: Error code: 401 - {'error': {'message': 'Missing Authentication header', 'code': 401}}`

**Cause**: Tried to use OpenRouter's API for text embeddings (`text-embedding-3-small`). OpenRouter is a model router for chat/completion, not embeddings.

**Solution**: Changed embedder to use `OPENAI_API_KEY` directly (not via OpenRouter). Falls back gracefully when no OpenAI key is available — knowledge indexing is skipped but agents still work.

**Lesson**: OpenRouter routes chat completions only. For embeddings, use OpenAI directly or a dedicated embedding service (Voyage AI, Cohere, etc.).

### 7. Route conflict with AgentOS

**Warning**: `Route conflict detected: GET /health - AgentOS route will override existing custom route`

**Cause**: AgentOS registers its own `/health` and `/agents` endpoints that override custom FastAPI routes.

**Solution**: Added `on_route_conflict="preserve_base_app"` to `AgentOS()` constructor.

**Lesson**: Always set `on_route_conflict="preserve_base_app"` when using a custom `base_app` with AgentOS.

### 8. Editable pip install in Docker

**Issue**: Greptile flagged `pip install -e .` in the Dockerfile builder stage as fragile.

**Cause**: Editable installs create symlinks to source that may not exist in the builder stage.

**Solution**: Changed to `pip install .` (regular install) and copy source separately for uvicorn module resolution.

**Lesson**: Never use editable installs in Docker production builds. Use regular `pip install .`.

### 9. Duplicate PostgresDb pools

**Issue**: Greptile flagged that `finance.py` and `main.py` each created their own `PostgresDb` instance.

**Solution**: Finance agent accepts `db` as a parameter from `main.py`. Single shared pool.

**Lesson**: Create one `PostgresDb` instance and pass it to all agents. Don't create module-level instances in agent files.

### 10. VPS IP hardcoded in README

**Issue**: Greptile flagged `204.168.169.254` and `root` in a public repository.

**Solution**: Replaced with `<VPS_IP>` placeholder.

---

## Coolify Configuration

| Field | Value |
|-------|-------|
| Repository | `aikapenelope/novaincs` |
| Branch | `main` |
| Build Pack | Dockerfile |
| Base Directory | `apps/agents` |
| Dockerfile Location | `Dockerfile` |
| Port | `8100` |
| Domain | None (internal service) |
| Network | `coolify` |
| Auto Deploy | ON |
| Consistent Container Name | ON |
| Health Check Path | `/health` |
| Health Check Port | `8100` |
| Health Check Start Period | `120` |

## Environment Variables (Runtime only, not Buildtime)

```
AGNO_DB_URL=postgresql+psycopg://agno:<PG_AGNO_PASSWORD>@pg-agno:5432/agno
OPENROUTER_API_KEY=<from OpenRouter dashboard>
GROQ_API_KEY=<from Groq console>
NOVA_API_URL=http://<api-container-name>:3000
AGENTS_PORT=8100
AGNO_TELEMETRY=false
```

Optional (enables knowledge base embeddings):
```
OPENAI_API_KEY=<from OpenAI dashboard>
```

---

## Dependencies (pyproject.toml)

```toml
dependencies = [
    "agno[os]",           # AgentOS runtime (FastAPI, uvicorn, sqlalchemy, JWT, OTel)
    "agno[postgres]",     # PostgreSQL driver (psycopg)
    "agno[openai]",       # OpenAI client (used by OpenRouter)
    "agno[groq]",         # Groq client (fast/cheap tasks)
    "agno[sqlite]",       # SQLite fallback for dev
    "agno[mcp]",          # MCP protocol for future integrations
    "psycopg[binary]",    # PostgreSQL binary driver
    "openai",             # OpenAI SDK (for OpenRouter compatibility)
    "lancedb",            # Local vector storage
    "pylance",            # LanceDB Python bindings
    "tantivy",            # Full-text search for LanceDB hybrid search
    "pypdf",              # PDF reader for knowledge base
    "httpx",              # HTTP client for calling Nova API
]
```

---

## What's NOT Modified

Agno is installed as-is from PyPI (`agno==2.6.7`). No patches, no monkey-patching, no internal code changes. All customization is via configuration (agents, models, tools, storage parameters).

The additional features (LearningMachine, CompressionManager, Guardrails) are copied from the qyne-v1 project pattern, not from the official Agno Docker template. They are standard Agno features but not included in the minimal template.

---

## Comparison: Official Template vs Our Setup

| Aspect | Official Template | Our Setup | Notes |
|--------|------------------|-----------|-------|
| Base image | `agnohq/python:3.12` | `python:3.12-slim` | Official has `uv` and `dockerize` pre-installed |
| Vector DB | PgVector (PostgreSQL) | LanceDB (local disk) | Could migrate to PgVector later |
| Embedder | OpenAI direct | OpenAI direct (optional) | Falls back gracefully without key |
| DB config | Separate env vars (DB_HOST, DB_PORT, etc.) | Single URL (AGNO_DB_URL) | Both work |
| Wait for DB | Yes (`dockerize -wait`) | No | pg-agno is always running before agents start |
| entrypoint.sh | Yes (banner, env print, wait) | No (direct CMD) | Simpler, works fine |
| config.yaml | Yes (quick prompts) | Yes | Added for control plane UI |
| LearningMachine | No | Yes | From qyne-v1 pattern |
| Guardrails | No | Yes (PII + prompt injection) | From qyne-v1 pattern |
| Compression | No | Yes | From qyne-v1 pattern |
