# Nova — Complete Stack Explained: Every Component, Why It's There, and How It Connects

> **Status**: Planning Phase — DEFINITIVE REFERENCE  
> **Last Updated**: May 2026

---

## 1. Deployment: Dokploy, Not Coolify

Coolify uses 500-700 MB RAM idle + 5-6% CPU before you deploy anything. On an 8 GB server where Nova needs ~5.6 GB for its own services, that leaves dangerously thin margins.

**Dokploy** uses 350 MB RAM idle + 0.8% CPU. It saves ~350 MB of RAM and 5% CPU compared to Coolify. Same core features: git-based auto-deploy, Docker Compose native support, Traefik for SSL/routing, web dashboard for management.

| Metric | Coolify | Dokploy | Winner |
|---|---|---|---|
| Idle RAM | 500-700 MB | ~350 MB | Dokploy |
| Idle CPU | 5-6% | 0.8% | Dokploy |
| Containers at idle | 6-8 | 3-4 | Dokploy |
| Docker Compose support | Yes | Yes (native) | Tie |
| Git auto-deploy | Yes | Yes | Tie |
| SSL (Let's Encrypt) | Yes (Traefik) | Yes (Traefik) | Tie |
| Web dashboard | Polished | Clean, functional | Coolify (nicer UI) |
| One-click apps | 280+ | Fewer | Coolify |
| Multi-server | Yes | Yes (Docker Swarm) | Tie |
| GitHub stars | ~35K | ~26K | Coolify |
| License | Open source | Open source | Tie |

**Dokploy wins for Nova** because every MB of RAM matters on a single CX32. You already know Coolify from platform-infra, but Dokploy's workflow is nearly identical: connect GitHub repo, configure environment variables, push to main, auto-deploy. The learning curve is minimal.

---

## 2. The Complete Stack: Layer by Layer

### Layer 1 — Hardware

```
Hetzner CX32 (Ashburn, Virginia)
├── 4 vCPU (shared AMD EPYC)
├── 8 GB RAM
├── 80 GB NVMe SSD
├── 20 TB bandwidth included
├── $8.49/month
└── + 50 GB Block Storage ($2.60/mo) mounted at /mnt/storage
```

**Why Ashburn**: ~60ms to Caracas. Helsinki would be ~150ms. The catalog runs on Cloudflare edge anyway, but the API and dashboard benefit from lower latency to Venezuela.

**Why CX32 not CX22**: The CX22 (2 vCPU, 4 GB) is too tight. PostgreSQL alone wants 2 GB for decent performance. CX32 gives breathing room. Upgrade to CX42 (8 vCPU, 16 GB, $16.49/mo) when you hit 500+ merchants.

### Layer 2 — Operating System & Deployment

```
Ubuntu 24.04 LTS
├── Docker Engine (containers)
├── Dokploy (deployment management + Traefik)
├── fail2ban (brute-force protection)
├── unattended-upgrades (auto security patches)
├── UFW firewall (ports 80, 443, 22 only)
└── 2 GB swap file (safety net for memory spikes)
```

**Dokploy installs with one command**: `curl -sSL https://dokploy.com/install.sh | sh`

It sets up Docker, Traefik, and the Dokploy dashboard. After install, you access the dashboard at `https://your-ip:3000`, connect your GitHub repo, and deploy.

### Layer 3 — Containers (What Actually Runs)

```
CONTAINER 1: nova-app (Hono API + BullMQ + Agno)
├── Runtime: Node.js 22 LTS
├── Framework: Hono 4.x (HTTP routing, middleware, CORS, rate limiting)
├── ORM: Drizzle (SQL queries, migrations, type inference)
├── Auth: Clerk SDK (JWT verification, tenant extraction)
├── Queue: BullMQ (background jobs, runs in same process)
├── Agents: Agno SDK (Python subprocess or HTTP call to agent service)
├── Validation: Zod (request/response schemas)
├── Memory: ~1.5-2 GB
├── Port: 3000
└── Connects to: PostgreSQL (5432), Redis (6379)

CONTAINER 2: nova-dashboard (Merchant PWA)
├── Runtime: Node.js 22 LTS
├── Framework: Nuxt 3 (SSR + PWA)
├── UI: Shadcn-vue + Tailwind CSS 4
├── PWA: @vite-pwa/nuxt (offline, installable)
├── Memory: ~512 MB
├── Port: 3001
└── Connects to: nova-app API (HTTP, port 3000)

CONTAINER 3: postgres
├── Image: pgvector/pgvector:pg16
├── Database: nova (single DB, multi-tenant via RLS)
├── Extensions: vector (embeddings), uuid-ossp (UUIDs)
├── Config: shared_buffers=1GB, effective_cache_size=2GB,
│           work_mem=32MB, max_connections=100
├── Memory: ~2 GB
├── Port: 5432 (internal only, not exposed to internet)
├── Data: /mnt/storage/postgres (block storage volume)
└── Backup: pg_dump daily cron → /mnt/storage/backups

CONTAINER 4: redis
├── Image: redis:7-alpine
├── Config: maxmemory 256mb, maxmemory-policy allkeys-lru,
│           appendonly yes
├── Uses: BullMQ queues, session cache, rate limiting,
│         behavioral event buffer (Redis Streams)
├── Memory: ~256-512 MB
├── Port: 6379 (internal only)
└── Data: Docker volume (persisted)

CONTAINER 5 (optional): nova-agents
├── Runtime: Python 3.12
├── Framework: Agno SDK
├── Agents: Sales, Finance, Content, Support
├── Memory: ~512 MB (only when agents are invoked)
├── Port: 8000 (internal only, called by nova-app)
└── Connects to: PostgreSQL (for memory/knowledge),
                 OpenAI API, Groq API, Photoroom API
```

**Why container 5 is optional**: For MVP, the Agno agents can run as a Python subprocess spawned by nova-app when needed, not as a separate always-running container. This saves ~512 MB. When agent usage grows (Phase 2+), spin it out to its own container.

**Total RAM usage**:

| Container | RAM |
|---|---|
| Dokploy + Traefik | 350 MB |
| nova-app | 1.5 GB |
| nova-dashboard | 512 MB |
| postgres | 2 GB |
| redis | 512 MB |
| OS + Docker | 500 MB |
| Swap headroom | 2 GB (swap file) |
| **Total** | **5.4 GB used / 8 GB available** |

2.6 GB free + 2 GB swap = comfortable margin.

### Layer 4 — Cloudflare (Catalog + DNS + CDN)

```
Cloudflare Account (free tier)
├── DNS: nova.app (or chosen domain)
│   ├── A record: api.nova.app → Hetzner CX32 IP
│   ├── A record: app.nova.app → Hetzner CX32 IP
│   └── CNAME: *.nova.app → Cloudflare Workers route
├── Workers: nova-catalog
│   ├── Nuxt 3 SSR (renders product pages at edge)
│   ├── Fetches data from api.nova.app (cached 60s)
│   ├── ~700 KB bundle (gzip)
│   └── Free tier: 100K requests/day
├── R2 Storage (S3-compatible)
│   ├── Product images (uploaded via nova-app → R2 API)
│   ├── Payment screenshots
│   ├── Import files
│   ├── $0.015/GB/month storage
│   ├── Free egress (no bandwidth charges)
│   └── Replaces MinIO (saves a container + RAM)
└── CDN: static assets auto-cached globally
```

**Why Cloudflare R2 instead of MinIO**: MinIO as a container uses ~512 MB RAM. R2 is S3-compatible (same API), costs $0.015/GB/month with free egress, and doesn't consume server resources. At 10 GB of images = $0.15/month. At 100 GB = $1.50/month. Much cheaper than the RAM MinIO would consume.

### Layer 5 — External Services

```
Clerk (auth)
├── Phone auth (SMS OTP) — critical for Venezuela
├── Google social login
├── JWT tokens verified by nova-app middleware
├── Tenant extraction: Clerk user_id → tenant lookup
├── Free tier: 10,000 MAU
└── Cost at 200 users: $0

Resend (email)
├── Monthly PDF reports
├── Weekly summaries
├── Welcome emails
├── React Email templates (built in TypeScript)
├── Free tier: 3,000 emails/month
└── Cost at 200 users: $0

OpenAI (LLM)
├── GPT-5 Mini: workhorse for all agent tasks
│   ├── $0.25/1M input tokens, $2.00/1M output tokens
│   ├── Vision capability (OCR for payment screenshots)
│   └── Used by: all 4 agents, column mapping, content generation
├── Cost at 200 users: ~$3/month
└── Fallback: Groq Llama for simple tasks

Groq (fast inference + voice)
├── Whisper: voice transcription (<1 second for 30s audio)
├── Llama 4 Scout: fast/cheap text tasks ($0.11/1M input)
├── Used by: voice commands, intent detection, simple parsing
├── Free tier available
└── Cost at 200 users: ~$2/month

Photoroom (image AI)
├── Background removal
├── Studio lighting
├── Product staging
├── $0.02/image via API
├── Pro plan: $7.50/month (includes API access)
└── Cost at 200 users: ~$40/month (2,000 images)

Google Cloud (Sheets API)
├── Service account for reading merchant Google Sheets
├── Merchant shares their sheet with Nova's service account email
├── Free (Google Sheets API has generous free tier)
└── Cost: $0
```

### Layer 6 — Application Code (Monorepo)

```
novaincs/                          ← GitHub repo
├── apps/
│   ├── api/                       ← Hono API server
│   │   ├── src/
│   │   │   ├── routes/            ← API endpoints (products, orders, customers, etc.)
│   │   │   ├── middleware/        ← Clerk auth, tenant context, RLS, rate limiting
│   │   │   ├── workers/           ← BullMQ job processors (images, events, reports)
│   │   │   ├── db/
│   │   │   │   ├── schema.ts      ← Drizzle schema (all tables)
│   │   │   │   ├── migrations/    ← SQL migration files
│   │   │   │   └── seed.ts        ← Test data
│   │   │   └── lib/               ← Shared utilities (rate calc, RFM scoring, etc.)
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── dashboard/                 ← Nuxt 3 merchant PWA
│   │   ├── pages/                 ← Route-based pages (home, products, orders, etc.)
│   │   ├── components/            ← Dashboard-specific components
│   │   ├── composables/           ← Vue composables (useAuth, useApi, etc.)
│   │   ├── Dockerfile
│   │   └── nuxt.config.ts
│   │
│   └── catalog/                   ← Nuxt 3 buyer PWA (Cloudflare Workers)
│       ├── pages/                 ← Catalog pages (browse, product detail, cart, checkout)
│       ├── components/            ← Catalog-specific components
│       ├── server/                ← Nuxt server routes (fetch from Nova API)
│       ├── wrangler.toml          ← Cloudflare Workers config
│       └── nuxt.config.ts         ← preset: 'cloudflare-workers'
│
├── agents/                        ← Python, Agno agents
│   ├── sales_agent.py
│   ├── finance_agent.py
│   ├── content_agent.py
│   ├── support_agent.py
│   ├── migration_agent.py         ← MCP-based data import
│   ├── mcp_server.py              ← Nova's proprietary MCP server
│   └── requirements.txt
│
├── packages/
│   ├── shared/                    ← TypeScript types shared across all apps
│   │   ├── types/                 ← Product, Customer, Order, etc.
│   │   └── utils/                 ← Formatting, validation, rate calculation
│   └── ui/                        ← Shared Vue components (Shadcn-vue based)
│       └── components/            ← Button, Card, Input, ProductCard, etc.
│
├── docker-compose.yml             ← Production compose (postgres + redis)
├── docker-compose.dev.yml         ← Local dev compose (adds hot reload)
├── pnpm-workspace.yaml
├── turbo.json                     ← Turborepo build config
├── .github/
│   └── workflows/
│       ├── ci.yml                 ← Lint + typecheck + test on PR
│       └── deploy-catalog.yml     ← Deploy catalog to Cloudflare Workers on merge
└── docs/                          ← Planning documents (01-11)
```

### Layer 7 — Data Flow (How Everything Connects)

```
BUYER visits catalog
  → Cloudflare Worker (edge SSR)
  → HTTP GET api.nova.app/v1/catalog/:slug/products
  → Hono API (nova-app container)
  → Drizzle → PostgreSQL (with RLS, tenant scoped)
  → JSON response → Worker renders HTML → buyer sees page

BUYER adds to cart + checks out
  → Catalog PWA (client-side cart in localStorage)
  → HTTP POST api.nova.app/v1/orders (name, phone, items, payment method)
  → Hono API → Drizzle → PostgreSQL (create order + reserve stock)
  → Response: order confirmation + payment instructions
  → Buyer pays via Pago Movil → uploads screenshot
  → HTTP POST api.nova.app/v1/payments/upload (image file)
  → BullMQ job: OCR verification (GPT-5 Mini vision)
  → Result stored in PostgreSQL → merchant notified

MERCHANT opens dashboard
  → app.nova.app (Nuxt 3 SSR on Hetzner)
  → Clerk auth → JWT → nova-app verifies → tenant context set
  → Dashboard fetches data from nova-app API (same server, localhost)
  → Sees: orders, customers, inventory, AI suggestions

MERCHANT talks to AI
  → Dashboard → HTTP POST api.nova.app/v1/agent/chat
  → nova-app → Agno agent (Python, same server or subprocess)
  → Agent queries PostgreSQL (tenant-scoped via user_id)
  → Agent calls GPT-5 Mini for reasoning
  → Response streamed back to dashboard

SCHEDULED JOBS (Prefect)
  → Prefect worker (runs inside nova-app or separate process)
  → Hourly: recalculate RFM scores (SQL aggregation)
  → Daily 8am: generate briefing (GPT-5 Mini)
  → Weekly Monday: send email summary (Resend API)
  → Monthly 1st: generate PDF report (Puppeteer → Resend)
  → Every 15min: check exchange rate (HTTP fetch → DB update)
```

---

## 3. Cost Summary

| Component | Monthly Cost |
|---|---|
| Hetzner CX32 | $8.49 |
| Hetzner backups | $1.70 |
| Hetzner block storage (50 GB) | $2.60 |
| Cloudflare (Workers + R2 + DNS) | $0 (free tier) |
| Clerk | $0 (free tier) |
| Resend | $0 (free tier) |
| OpenAI (GPT-5 Mini) | $3 |
| Groq (Whisper + Llama) | $2 |
| Photoroom | $40 |
| Cloudflare R2 (~10 GB images) | $0.15 |
| Domain | $1.25 |
| **Total** | **$59.19/month** |

Revenue at 200 merchants: ~$1,340/month. Margin: 95.6%.

---

## 4. What's Missing: Nothing

Every component is named. Every connection is mapped. Every cost is calculated. The stack is:

- **Dokploy** for deployment (lighter than Coolify, same features)
- **Hono** for API (lightest TypeScript HTTP framework)
- **Drizzle** for database (lightest TypeScript ORM)
- **Nuxt 3** for both PWAs (one framework, shared components)
- **Cloudflare Workers** for catalog edge rendering
- **Cloudflare R2** for image storage (replaces MinIO)
- **Agno** for AI agents (model-agnostic, MCP-native)
- **BullMQ** for background jobs (runs on existing Redis)
- **Prefect** for scheduled workflows (runs on existing PostgreSQL)
- **Clerk** for auth (phone + social)
- **Resend** for email (reports, notifications)
- **GPT-5 Mini** for LLM tasks (cheapest with vision)
- **Groq** for voice + fast inference
- **Photoroom** for image enhancement

14 components. Each one chosen for a specific reason. Each one replaceable independently. Nothing redundant. Nothing missing.
