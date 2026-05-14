# Nova — Production Architecture: Proper Service Isolation

> **Status**: Planning Phase — REPLACES doc 12  
> **Last Updated**: May 2026  
> **Principle**: Robustness and stability over speed or resource savings.

---

## 1. The Problem with the Previous Design

Doc 12 mixed concerns inside containers to save RAM. That's a development shortcut, not a production architecture. Specifically:

- **nova-app** was running Hono API + BullMQ workers + Agno agents in one Node.js process. If a BullMQ worker crashes processing an image, it takes down the API.
- **Agno and Prefect were sharing Nova's PostgreSQL.** Agno stores memories, sessions, traces, and knowledge. Prefect stores flow runs, task states, and schedules. Mixing that with Nova's business data (products, orders, customers) in one database creates coupling and makes debugging, backups, and migrations harder.
- **Prefect wasn't even a separate container.** It was mentioned as running "inside nova-app." That's not how Prefect works in production.

This document corrects all of that. Each service gets its own container. Each stateful service gets its own database. If one service crashes, the others keep running.

---

## 2. Production Container Architecture

### 8 Containers, Properly Isolated

```
┌─────────────────────────────────────────────────────────────┐
│                    Hetzner CX43                              │
│              8 vCPU, 16 GB RAM, 160 GB NVMe                 │
│                    Helsinki (hel1)                            │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  nova-api       │  │  nova-dashboard  │                   │
│  │  (Hono + BullMQ │  │  (Nuxt 3 SSR)   │                   │
│  │   workers)      │  │                  │                   │
│  │  Port: 3000     │  │  Port: 3001      │                   │
│  │  ~1 GB          │  │  ~512 MB         │                   │
│  └────────┬────────┘  └────────┬─────────┘                   │
│           │                    │                              │
│  ┌────────┴────────┐  ┌───────┴──────────┐                   │
│  │  nova-agents    │  │  prefect-server   │                   │
│  │  (Agno AgentOS) │  │  + prefect-worker │                   │
│  │  Python 3.12    │  │  Python 3.12      │                   │
│  │  Port: 8000     │  │  Port: 4200       │                   │
│  │  ~1 GB          │  │  ~512 MB          │                   │
│  └────────┬────────┘  └───────┬──────────┘                   │
│           │                    │                              │
│  ┌────────┴────────────────────┴──────────┐                   │
│  │              DATABASES                  │                   │
│  │                                         │                   │
│  │  ┌─────────────┐  ┌─────────────┐      │                   │
│  │  │ pg-nova     │  │ pg-agno     │      │                   │
│  │  │ Port: 5432  │  │ Port: 5433  │      │                   │
│  │  │ ~2 GB       │  │ ~512 MB     │      │                   │
│  │  │ Business    │  │ Agent       │      │                   │
│  │  │ data + RLS  │  │ memories,   │      │                   │
│  │  │             │  │ sessions,   │      │                   │
│  │  │             │  │ traces      │      │                   │
│  │  └─────────────┘  └─────────────┘      │                   │
│  │                                         │                   │
│  │  ┌─────────────┐                        │                   │
│  │  │ pg-prefect  │                        │                   │
│  │  │ Port: 5434  │                        │                   │
│  │  │ ~256 MB     │                        │                   │
│  │  │ Flow runs,  │                        │                   │
│  │  │ schedules,  │                        │                   │
│  │  │ task states │                        │                   │
│  │  └─────────────┘                        │                   │
│  └─────────────────────────────────────────┘                   │
│                                                              │
│  ┌─────────────────┐                                         │
│  │  redis          │                                         │
│  │  Port: 6379     │                                         │
│  │  ~512 MB        │                                         │
│  │  Cache + BullMQ │                                         │
│  │  + Prefect msgs │                                         │
│  └─────────────────┘                                         │
│                                                              │
│  ┌─────────────────┐                                         │
│  │  Dokploy        │                                         │
│  │  + Traefik      │                                         │
│  │  ~350 MB        │                                         │
│  └─────────────────┘                                         │
│                                                              │
│  Total: ~6.6 GB used / 16 GB available                       │
│  Free: ~9.4 GB (headroom for spikes + OS)                    │
└─────────────────────────────────────────────────────────────┘
```

### Why CX43 Instead of CX32

The CX32 (8 GB) was tight with everything crammed into one process. With proper isolation (8 containers, 3 PostgreSQL instances), 8 GB is not enough. The CX43 costs $16.49/month (vs $8.49) and gives:

| Spec | CX32 | CX43 |
|---|---|---|
| vCPU | 4 | 8 |
| RAM | 8 GB | 16 GB |
| NVMe | 80 GB | 160 GB |
| Price | $8.49/mo | $16.49/mo |

The extra $8/month buys proper isolation, headroom for traffic spikes, and room to grow to 500+ merchants without upgrading. At $15/merchant average revenue, you need 2 paying merchants to cover the entire server.

---

## 3. Each Service Explained

### Container 1: nova-api

```
Image: node:22-alpine + custom build
Port: 3000
RAM: ~1 GB
Connects to: pg-nova (5432), redis (6379), nova-agents (8000)

What it does:
├── Hono HTTP server (API endpoints)
├── Clerk auth middleware (JWT verification, tenant context)
├── Drizzle ORM (queries to pg-nova)
├── BullMQ workers (in same process, separate threads):
│   ├── image-processor (calls Photoroom API)
│   ├── event-processor (behavioral events from Redis Streams)
│   ├── payment-verifier (calls nova-agents for OCR)
│   └── report-generator (calls Resend for email)
└── Zod validation (request/response schemas)

Why BullMQ stays here (not separate container):
BullMQ workers are lightweight Node.js event handlers. They share the
same Redis connection and the same Drizzle ORM instance as the API.
Separating them would mean duplicating the DB connection pool and
adding inter-container HTTP calls for no benefit. BullMQ is designed
to run in-process. If a worker fails, BullMQ retries the job
automatically — it doesn't crash the API process.
```

### Container 2: nova-dashboard

```
Image: node:22-alpine + Nuxt 3 build
Port: 3001
RAM: ~512 MB
Connects to: nova-api (3000) via HTTP

What it does:
├── Nuxt 3 SSR (server-side rendering)
├── Tailwind CSS 4 + Shadcn-vue (UI)
├── @vite-pwa/nuxt (offline, installable)
└── Fetches all data from nova-api (never touches DB directly)

Why it's separate from nova-api:
The dashboard is a frontend app. It should never have direct DB access.
If the dashboard crashes (bad Vue component, memory leak), the API
keeps serving the catalog and processing orders.
```

### Container 3: nova-agents (Agno AgentOS)

```
Image: python:3.12-slim + Agno SDK
Port: 8000
RAM: ~1 GB
Connects to: pg-agno (5433), pg-nova (5432 read-only), redis (6379)

What it does:
├── Agno AgentOS runtime (FastAPI with 50+ endpoints)
├── Sales Agent
├── Finance Agent
├── Content Agent
├── Support Agent
├── Migration Agent (MCP-based)
├── MCP Server (Nova's proprietary tools)
└── OpenTelemetry tracing (built-in)

Database: pg-agno (SEPARATE from pg-nova)
├── agent_sessions (conversation history per tenant)
├── agent_memories (long-term memory per tenant)
├── agent_runs (execution logs, traces)
└── knowledge_vectors (pgvector embeddings for RAG)

Why separate database:
Agno's docs explicitly show a separate PostgreSQL instance. Agent
memories and traces are high-write, append-only data that grows
fast. Mixing it with business data would bloat pg-nova's WAL,
slow down backups, and make it harder to debug agent issues
independently of business logic issues.

How it reads Nova's business data:
nova-agents connects to pg-nova as a READ-ONLY user. It can query
products, customers, orders, inventory — but cannot write to them.
All writes go through nova-api. This prevents agents from
accidentally corrupting business data.
```

### Container 4: prefect-server + prefect-worker

```
Image: prefecthq/prefect:3-latest
Port: 4200 (UI, optional)
RAM: ~512 MB
Connects to: pg-prefect (5434), redis (6379), nova-api (3000)

What it does:
├── Prefect Server (orchestration engine)
├── Prefect Services (background scheduler)
├── Prefect Worker (executes flows)
└── Scheduled flows:
    ├── rfm_scoring (hourly) — calls nova-api to trigger RFM recalculation
    ├── daily_briefing (daily 8am) — calls nova-agents to generate briefing
    ├── weekly_summary (Monday 8am) — calls nova-api for data, Resend for email
    ├── monthly_report (1st of month) — calls nova-api + nova-agents + Resend
    ├── exchange_rate_check (every 15 min) — HTTP fetch + calls nova-api to update
    └── subscription_expiry (daily) — calls nova-api to check/downgrade expired plans

Database: pg-prefect (SEPARATE from pg-nova and pg-agno)
├── flow_runs (execution history)
├── task_runs (individual task results)
├── deployments (flow configurations)
└── schedules (cron definitions)

Why separate database:
Prefect's official Docker Compose shows a dedicated PostgreSQL.
Prefect writes heavily to its state tables during flow execution.
Mixing with business data would cause lock contention. Separate
DB means you can wipe Prefect's history without touching anything else.

How it triggers work:
Prefect flows don't access the database directly. They call nova-api
endpoints via HTTP. Example: the rfm_scoring flow calls
POST nova-api:3000/internal/jobs/rfm-recalculate. The API does the
actual DB work. Prefect just orchestrates timing and retries.
```

### Containers 5-7: Three PostgreSQL Instances

```
Container 5: pg-nova
├── Image: pgvector/pgvector:pg16
├── Port: 5432
├── RAM: ~2 GB (shared_buffers=768MB, effective_cache_size=1.5GB)
├── Data: /var/lib/nova/pg-nova (server disk, covered by Hetzner backups)
├── Extensions: vector, uuid-ossp
├── RLS: enabled (multi-tenant isolation)
├── Backup: daily pg_dump → /var/lib/nova/backups/nova
└── Contains: tenants, products, customers, orders, payments,
              inventory, events, subscriptions — ALL business data

Container 6: pg-agno
├── Image: agnohq/pgvector:16 (official Agno image)
├── Port: 5433
├── RAM: ~512 MB (shared_buffers=128MB)
├── Data: /var/lib/nova/pg-agno (server disk, covered by Hetzner backups)
├── Extensions: vector
├── Backup: weekly pg_dump (less critical, can be regenerated)
└── Contains: agent sessions, memories, traces, knowledge vectors

Container 7: pg-prefect
├── Image: postgres:16-alpine (no pgvector needed)
├── Port: 5434
├── RAM: ~256 MB (shared_buffers=64MB)
├── Data: Docker volume (not block storage — less critical)
├── Backup: not needed (flow history is operational, not business data)
└── Contains: flow runs, task runs, deployments, schedules
```

### Container 8: Redis

```
Image: redis:7-alpine
Port: 6379
RAM: ~512 MB
Config: maxmemory 384mb, appendonly yes

Shared by:
├── nova-api: BullMQ job queues, session cache, rate limiting
├── nova-api: Redis Streams (behavioral event buffer)
├── prefect: message broker (PREFECT_REDIS_MESSAGING_HOST)
└── nova-agents: (optional) cache for hot agent data

Why one Redis (not three):
Redis is stateless for most uses (cache, queues, pub/sub). The data
is ephemeral or reproducible. Unlike PostgreSQL where data corruption
is catastrophic, Redis data loss means jobs retry and cache rebuilds.
One Redis instance with logical databases (DB 0 = BullMQ, DB 1 = cache,
DB 2 = Prefect) is the standard pattern.
```

---

## 4. Memory Budget (16 GB)

| Container | RAM Allocated | Notes |
|---|---|---|
| Dokploy + Traefik | 350 MB | Deployment management |
| nova-api | 1,000 MB | API + BullMQ workers |
| nova-dashboard | 512 MB | Nuxt 3 SSR |
| nova-agents | 1,000 MB | Agno AgentOS (Python) |
| prefect-server + worker | 512 MB | Orchestration |
| pg-nova | 2,000 MB | Business database |
| pg-agno | 512 MB | Agent database |
| pg-prefect | 256 MB | Prefect database |
| redis | 512 MB | Cache + queues |
| OS + Docker | 500 MB | Kernel, Docker daemon |
| **Total used** | **7,154 MB** | |
| **Free** | **~8.8 GB** | Headroom for spikes, growth |

8.8 GB free. That's enough headroom for traffic spikes, PostgreSQL query caches, and growth to 500+ merchants without upgrading.

---

## 5. Updated Cost

| Component | Monthly Cost |
|---|---|
| Hetzner CX43 (8 vCPU, 16 GB) — Helsinki | ~€16 |
| Hetzner backups | ~€3 |
| Cloudflare (Workers + R2 + DNS) | $0 |
| Clerk | $0 |
| Resend | $0 |
| OpenAI (GPT-5 Mini) | $3 |
| Groq | $2 |
| Photoroom | $40 |
| Cloudflare R2 (~10 GB) | $0.15 |
| Domain | $1.25 |
| **Total** | **~€65/month** |

At $15/merchant, you need 5 paying merchants to cover the entire infrastructure. Revenue at 200 merchants: ~$1,340/month. Margin: ~95%.

---

## 6. Docker Compose (Production)

```yaml
services:
  # === APPLICATION SERVICES ===

  nova-api:
    build: ./apps/api
    container_name: nova-api
    restart: unless-stopped
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://nova:${PG_NOVA_PASSWORD}@pg-nova:5432/nova
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
      AGENTS_URL: http://nova-agents:8000
      CLERK_SECRET_KEY: ${CLERK_SECRET_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      PHOTOROOM_API_KEY: ${PHOTOROOM_API_KEY}
      RESEND_API_KEY: ${RESEND_API_KEY}
    depends_on:
      pg-nova: { condition: service_healthy }
      redis: { condition: service_healthy }
    deploy:
      resources:
        limits: { memory: 1G }
    networks: [nova-net]

  nova-dashboard:
    build: ./apps/dashboard
    container_name: nova-dashboard
    restart: unless-stopped
    ports: ["3001:3000"]
    environment:
      NUXT_PUBLIC_API_URL: http://nova-api:3000
    deploy:
      resources:
        limits: { memory: 512M }
    networks: [nova-net]

  nova-agents:
    build: ./agents
    container_name: nova-agents
    restart: unless-stopped
    ports: ["8000:8000"]
    environment:
      AGNO_DB_URL: postgresql://agno:${PG_AGNO_PASSWORD}@pg-agno:5432/agno
      NOVA_DB_URL: postgresql://nova_readonly:${PG_NOVA_RO_PASSWORD}@pg-nova:5432/nova
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      GROQ_API_KEY: ${GROQ_API_KEY}
    depends_on:
      pg-agno: { condition: service_healthy }
      pg-nova: { condition: service_healthy }
    deploy:
      resources:
        limits: { memory: 1G }
    networks: [nova-net]

  prefect:
    image: prefecthq/prefect:3-latest
    container_name: nova-prefect
    restart: unless-stopped
    ports: ["4200:4200"]
    environment:
      PREFECT_API_DATABASE_CONNECTION_URL: postgresql+asyncpg://prefect:${PG_PREFECT_PASSWORD}@pg-prefect:5432/prefect
      PREFECT_SERVER_API_HOST: 0.0.0.0
      PREFECT_MESSAGING_BROKER: prefect_redis.messaging
      PREFECT_MESSAGING_CACHE: prefect_redis.messaging
      PREFECT_REDIS_MESSAGING_HOST: redis
      PREFECT_REDIS_MESSAGING_PORT: 6379
      PREFECT_REDIS_MESSAGING_DB: 2
    command: >
      bash -c "prefect server start --no-services &
               prefect server services start &
               prefect worker start --pool nova-pool"
    depends_on:
      pg-prefect: { condition: service_healthy }
      redis: { condition: service_healthy }
    deploy:
      resources:
        limits: { memory: 512M }
    networks: [nova-net]

  # === DATABASES ===

  pg-nova:
    image: pgvector/pgvector:pg16
    container_name: pg-nova
    restart: unless-stopped
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: nova
      POSTGRES_PASSWORD: ${PG_NOVA_PASSWORD}
      POSTGRES_DB: nova
    volumes:
      - /var/lib/nova/pg-nova:/var/lib/postgresql/data
    command:
      - "postgres"
      - "-c" 
      - "shared_buffers=768MB"
      - "-c"
      - "effective_cache_size=1536MB"
      - "-c"
      - "work_mem=32MB"
      - "-c"
      - "max_connections=100"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nova"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits: { memory: 2G }
    networks: [nova-net]

  pg-agno:
    image: agnohq/pgvector:16
    container_name: pg-agno
    restart: unless-stopped
    ports: ["5433:5432"]
    environment:
      POSTGRES_USER: agno
      POSTGRES_PASSWORD: ${PG_AGNO_PASSWORD}
      POSTGRES_DB: agno
    volumes:
      - /var/lib/nova/pg-agno:/var/lib/postgresql/data
    command:
      - "postgres"
      - "-c"
      - "shared_buffers=128MB"
      - "-c"
      - "max_connections=50"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agno"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits: { memory: 512M }
    networks: [nova-net]

  pg-prefect:
    image: postgres:16-alpine
    container_name: pg-prefect
    restart: unless-stopped
    ports: ["5434:5432"]
    environment:
      POSTGRES_USER: prefect
      POSTGRES_PASSWORD: ${PG_PREFECT_PASSWORD}
      POSTGRES_DB: prefect
    volumes:
      - prefect_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U prefect"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits: { memory: 256M }
    networks: [nova-net]

  redis:
    image: redis:7-alpine
    container_name: nova-redis
    restart: unless-stopped
    ports: ["6379:6379"]
    command: >
      redis-server
      --appendonly yes
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 384mb
      --maxmemory-policy allkeys-lru
      --databases 4
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits: { memory: 512M }
    networks: [nova-net]

volumes:
  prefect_pgdata:
  redis_data:

networks:
  nova-net:
    name: nova-network
```

---

## 7. What This Architecture Guarantees

| Failure Scenario | Impact | Recovery |
|---|---|---|
| nova-api crashes | Dashboard shows error, catalog serves cached pages | Docker restarts in <5 seconds |
| nova-agents crashes | AI features unavailable, everything else works | Docker restarts, agent state preserved in pg-agno |
| prefect crashes | Scheduled jobs pause, everything else works | Docker restarts, resumes from last checkpoint |
| pg-nova crashes | All business operations stop | Docker restarts, data on block storage is durable |
| pg-agno crashes | Agents can't access memory, fall back to stateless mode | Docker restarts, agent data preserved |
| pg-prefect crashes | Scheduled jobs stop | Docker restarts, Prefect rebuilds state |
| redis crashes | Cache cold, jobs queue up, events buffer | Docker restarts, BullMQ replays pending jobs |
| Entire server crashes | Everything stops | Hetzner restarts VM, Docker Compose restarts all containers |

No single container failure takes down the entire system. That's the point of isolation.
