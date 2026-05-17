# Nova Agents

AI agent platform for Nova merchants, powered by [Agno AgentOS](https://docs.agno.com).

## Architecture

```
Dashboard (Nuxt) → API (Hono/Node.js) → nova-agents (Agno/Python) → LLM (OpenRouter)
                                              ↓
                                          pg-agno (PostgreSQL + pgvector)
```

The agents container runs as a standalone FastAPI service on port 8100.
The Node.js API calls it via HTTP on the Docker network (`coolify`).

## Agents

| Agent | ID | Description | Model |
|-------|----|-------------|-------|
| Finance Agent | `finance-agent` | Payment OCR, daily briefings, financial alerts | OpenRouter (GPT-5 Mini vision) |

More agents (Sales, Content, Support) will be added in future sprints.

## Local Development

```bash
cd apps/agents
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Set environment variables
export AGNO_DB_URL="postgresql+psycopg://agno:agno_dev@localhost:5433/agno"
export OPENROUTER_API_KEY="your-key"
export NOVA_API_URL="http://localhost:3000"

# Run
uvicorn src.main:app --host 0.0.0.0 --port 8100 --reload
```

## Production Deployment (Coolify)

1. In Coolify, create a new app:
   - Repository: `aikapenelope/novaincs`
   - Branch: `main`
   - Build pack: Dockerfile
   - Dockerfile: `apps/agents/Dockerfile`
   - Port: 8100

2. Set environment variables in Coolify:
   ```
   AGNO_DB_URL=postgresql+psycopg://agno:<PG_AGNO_PASSWORD>@pg-agno:5432/agno
   OPENROUTER_API_KEY=<from OpenRouter dashboard>
   GROQ_API_KEY=<from Groq console>
   NOVA_API_URL=http://<api-container-name>:3000
   AGENTS_PORT=8100
   AGENTS_MODEL=openai/gpt-4o-mini
   ```

3. Enable:
   - Consistent Container Name: ON
   - Auto Deploy: ON
   - Network: `coolify` (same as API and Dashboard)

4. The container is accessible via SSH tunnel:
   ```bash
   ssh -L 8100:localhost:8100 root@<VPS_IP>
   # Then open http://localhost:8100/health
   ```

## API Endpoints

AgentOS exposes 50+ endpoints automatically. Key ones:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/agents` | List available agents |
| POST | `/v1/runs` | Run an agent (AgentOS standard) |
| GET | `/v1/sessions` | List sessions |

## Validation

```bash
source .venv/bin/activate
pyright src/
ruff check src/
ruff format --check src/
```
