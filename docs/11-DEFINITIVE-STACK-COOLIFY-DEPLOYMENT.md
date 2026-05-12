# Nova — Definitive Stack: Coolify Deployment, Infrastructure Map & Final Checklist

> **Status**: Planning Phase — FINAL  
> **Last Updated**: May 2026  
> **Scope**: Deployment strategy using existing Coolify infrastructure, complete stack with every component named, and final gap analysis.

---

## 1. Deployment: Coolify on Your Existing Infrastructure

Nova doesn't need a new server. It deploys on your existing 3-plane Hetzner architecture via Coolify, exactly like Aurora, Docflow, and Whabi.

### 1.1 Where Nova Runs

```
EXISTING INFRASTRUCTURE (already running)
──────────────────────────────────────────

Control Plane (CX23, 10.0.1.10)
├── Coolify (manages all deployments)
├── Traefik (reverse proxy, SSL)
└── Tailscale (VPN access)

Data Plane (CX33, 10.0.1.20)
├── PostgreSQL 16 + pgvector (DB: nova — already created)
├── PgBouncer (port 6432 — NOT used by Nova due to RLS)
├── Redis 7 (DB 4 — already assigned to Nova)
├── MinIO (bucket: nova-receipts — already created)
└── Daily backups (cron, 7-day retention)

App Plane A (CX33, 10.0.1.30)
├── Whabi containers
├── Docflow containers
├── Aurora containers
└── Nova containers ← NEW (deployed via Coolify)

CLOUDFLARE (new, for catalog only)
──────────────────────────────────
├── Nova Catalog PWA (Nuxt 3 on Workers)
└── DNS + CDN for static assets
```

### 1.2 How Coolify Deploys Nova

Coolify on the Control Plane (10.0.1.10) manages containers on App Plane A (10.0.1.30) remotely via Docker API over the private network. The deployment flow:

```
1. Developer pushes to GitHub (main branch)
2. Coolify detects the push (webhook)
3. Coolify builds the Docker image on App Plane A
4. Coolify starts/restarts the container on App Plane A
5. Traefik on Control Plane routes traffic to the container
```

No CI/CD pipeline to build. No Docker registry to manage. No SSH deploy scripts. Coolify handles it all — same as your other projects.

### 1.3 Nova's Containers on App Plane A

Nova needs **2 containers** on App Plane A (not 5, not 10):

| Container | What It Does | Port | Memory |
|---|---|---|---|
| **nova-app** | Hono API + BullMQ workers + Agno agents (one Node.js process) | 3000 | ~1.5 GB |
| **nova-dashboard** | Nuxt 3 SSR (merchant PWA) | 3001 | ~512 MB |

That's it. PostgreSQL, Redis, and MinIO already run on the Data Plane. The catalog PWA runs on Cloudflare Workers. No Caddy/Traefik needed — Coolify's Traefik on the Control Plane handles SSL and routing.

**Total additional memory on App Plane A: ~2 GB.** The CX33 has 8 GB RAM. With Whabi, Docflow, and Aurora already running, there's capacity for Nova. If it gets tight, enable App Plane B (already defined in your Pulumi config with `appPlaneBEnabled`).

### 1.4 Coolify Configuration for Nova

In Coolify's dashboard, create two new services:

**Service 1: nova-app**
- Source: GitHub repo `aikapenelope/novaincs`, path `apps/api`
- Build: Dockerfile
- Port: 3000
- Domain: `api.nova.app` (or subdomain of your choice)
- Environment variables (from ESC `platform-infra/nova`):
  ```
  DATABASE_URL=postgresql://platform:***@10.0.1.20:5432/nova
  REDIS_URL=redis://:***@10.0.1.20:6379/4
  MINIO_ENDPOINT=http://10.0.1.20:9000
  MINIO_BUCKET=nova-receipts
  MINIO_ACCESS_KEY=***
  MINIO_SECRET_KEY=***
  CLERK_SECRET_KEY=***
  OPENAI_API_KEY=***
  GROQ_API_KEY=***
  PHOTOROOM_API_KEY=***
  RESEND_API_KEY=***
  ```

**Service 2: nova-dashboard**
- Source: GitHub repo `aikapenelope/novaincs`, path `apps/dashboard`
- Build: Dockerfile
- Port: 3001
- Domain: `app.nova.app`
- Environment variables: `NUXT_PUBLIC_API_URL=https://api.nova.app`

**Catalog (separate, not in Coolify)**:
- Deployed to Cloudflare Workers via `wrangler deploy` in GitHub Actions
- Domain: `*.nova.app` (wildcard for merchant catalogs) or custom domains

---

## 2. Complete Stack: Every Component Named

### 2.1 The Full Picture

```
LAYER 1: BUYER INTERFACE
├── Nuxt 3 (Cloudflare Workers) — catalog PWA
├── @vite-pwa/nuxt — offline support, installable
├── Tailwind CSS 4 — styling
├── Shadcn-vue — UI components
└── Cloudflare CDN — static assets (images, CSS, JS)

LAYER 2: MERCHANT INTERFACE
├── Nuxt 3 (Hetzner via Coolify) — dashboard PWA
├── @vite-pwa/nuxt — offline support, installable
├── Tailwind CSS 4 — styling
├── Shadcn-vue — UI components (shared with catalog via monorepo)
└── Traefik (Coolify) — SSL, routing

LAYER 3: API
├── Hono 4.x — HTTP framework (14kb)
├── Drizzle ORM — database access (7.4kb, SQL-first)
├── Clerk SDK — authentication middleware
├── BullMQ — background job queue (image processing, events, reports)
├── Zod — request/response validation
└── Hetzner via Coolify — deployment

LAYER 4: AI AGENTS
├── Agno AgentOS — agent framework + runtime + observability
├── OpenAI GPT-5 Mini — workhorse LLM ($0.25/1M input tokens)
├── Groq Llama 4 Scout — fast/cheap tasks ($0.11/1M input tokens)
├── Groq Whisper — voice transcription
├── Photoroom API — image enhancement ($0.02/image)
└── MCP Protocol — tool integration standard

LAYER 5: DATA
├── PostgreSQL 16 + pgvector — primary database (10.0.1.20:5432/nova)
├── Redis 7 — cache + BullMQ queues (10.0.1.20:6379/4)
├── MinIO — object storage for images (10.0.1.20:9000/nova-receipts)
└── Hetzner Data Plane — hosting

LAYER 6: SCHEDULED JOBS
├── Prefect 3 — workflow orchestration (runs on App Plane A)
│   ├── RFM score calculation (hourly)
│   ├── Daily briefing generation (daily 8am)
│   ├── Weekly email summary (Monday 8am)
│   ├── Monthly PDF report (1st of month)
│   └── Exchange rate check (every 15 min)
└── BullMQ cron — lightweight recurring tasks
    ├── Event processing (every 5 seconds)
    ├── Cache invalidation (on stock change)
    └── Subscription expiry check (daily)

LAYER 7: EXTERNAL SERVICES
├── Clerk — authentication (phone + Google login)
├── Resend — transactional email (reports, notifications)
├── Cloudflare — DNS, CDN, Workers
├── Google Sheets API — import via service account
└── Meta WhatsApp Cloud API — Phase 3 (broadcasts, chatbot)

LAYER 8: INFRASTRUCTURE
├── Hetzner Cloud — 3-plane architecture (existing)
├── Coolify — deployment management (existing)
├── Traefik — reverse proxy + SSL (existing)
├── Tailscale — VPN access (existing)
├── Pulumi — infrastructure as code (existing)
└── ESC — secrets management (existing)

LAYER 9: DEVELOPMENT
├── pnpm workspaces — monorepo management
├── Turborepo — build orchestration
├── TypeScript — language (everywhere except Agno agents)
├── Python 3.12 — Agno agents + Prefect flows
├── Vitest — unit/integration tests
├── Playwright — E2E tests
├── ESLint + Prettier — linting/formatting
├── GitHub Actions — CI (lint, typecheck, test)
└── Coolify webhooks — CD (auto-deploy on push to main)
```

### 2.2 What's New vs What Already Exists

| Component | Status | Notes |
|---|---|---|
| Hetzner 3-plane architecture | **Exists** | No changes needed |
| Coolify | **Exists** | Add 2 new services for Nova |
| Traefik | **Exists** | Add routing rules for nova domains |
| Tailscale | **Exists** | No changes |
| PostgreSQL 16 + pgvector | **Exists** | DB `nova` already created by init-databases.sh |
| Redis 7 | **Exists** | DB 4 already assigned to Nova |
| MinIO | **Exists** | Bucket `nova-receipts` needs creation via init-minio-buckets.sh |
| PgBouncer | **Exists** | NOT used by Nova (RLS needs direct connection) |
| Pulumi IaC | **Exists** | nova.ts already defines connection strings |
| ESC secrets | **Exists** | Need to create `platform-infra/nova` environment |
| Cloudflare account | **New** | For catalog Workers + DNS |
| Clerk project | **New** | Auth for Nova |
| Resend account | **New** | Email delivery |
| OpenAI API key | **New** | LLM for agents |
| Groq API key | **New** | Voice + fast inference |
| Photoroom API key | **New** | Image enhancement |
| Google Cloud service account | **New** | Google Sheets import |
| Nova application code | **New** | The actual product |

### 2.3 MinIO Bucket Update

The existing `init-minio-buckets.sh` on the Data Plane needs one addition. The bucket `nova-receipts` is defined in `nova.ts` but not yet in the init script. Add:

```bash
docker run --rm --network data-plane minio/mc mb --ignore-existing local/nova-receipts
docker run --rm --network data-plane minio/mc mb --ignore-existing local/nova-products  # product images
docker run --rm --network data-plane minio/mc mb --ignore-existing local/nova-imports   # uploaded files for import
```

---

## 3. What's Missing: Final Gap Analysis

### 3.1 Nothing Is Missing for Planning

The 10 documents cover:

| Area | Document | Status |
|---|---|---|
| Market, competition, positioning | 01 | Complete |
| CRM value, data ingestion, multi-tenant | 02 | Complete |
| Customer identity, DB sizing, Wakit, MCP | 03 | Complete |
| Checkout flow, dashboard UX, agent data | 04 | Complete |
| Reports, stack comparison, 89 features, API | 05 | Complete |
| Roadmap, tiers, infrastructure, growth | 06 | Complete |
| Voice input, minimal infra, Prefect, BSP | 07 | Complete |
| Feature classification, LLM costs | 08 | Complete |
| Catalog edge deployment, pre-dev checklist | 09 | Complete |
| Workers architecture, billing, observability | 10 | Complete |
| Deployment on existing infra, full stack | 11 (this doc) | Complete |

### 3.2 What Remains Before Coding

Only execution tasks remain. No more planning needed.

**Day 1 — Accounts & Decisions (4 hours)**:
- [ ] Decide product name and domain
- [ ] Create Cloudflare account, add domain
- [ ] Create Clerk project (phone auth + Google)
- [ ] Create Resend account, verify domain
- [ ] Get OpenAI API key
- [ ] Get Groq API key
- [ ] Get Photoroom API key
- [ ] Create Google Cloud service account for Sheets API
- [ ] Create ESC environment `platform-infra/nova` with all secrets

**Day 2 — Monorepo & Scaffolding (6 hours)**:
- [ ] Initialize pnpm workspace + turborepo in novaincs repo
- [ ] Scaffold `apps/api` (Hono + Drizzle + BullMQ)
- [ ] Scaffold `apps/dashboard` (Nuxt 3 + Tailwind + Shadcn-vue + PWA)
- [ ] Scaffold `apps/catalog` (Nuxt 3 + Cloudflare Workers preset)
- [ ] Scaffold `packages/shared` (TypeScript types)
- [ ] Scaffold `packages/ui` (shared Vue components)
- [ ] Configure ESLint + Prettier for monorepo
- [ ] Configure Vitest

**Day 3 — Database & Auth (8 hours)**:
- [ ] Write Drizzle schema (all MVP tables with RLS)
- [ ] Run migrations against `nova` database on Data Plane
- [ ] Integrate Clerk auth middleware in Hono
- [ ] Implement tenant context extraction + RLS session variable
- [ ] Write RLS security tests

**Day 4 — Deployment Pipeline (4 hours)**:
- [ ] Create Dockerfiles for `nova-app` and `nova-dashboard`
- [ ] Configure Coolify services (2 containers on App Plane A)
- [ ] Configure Cloudflare Workers deployment for catalog
- [ ] Set up GitHub Actions for CI (lint + typecheck + test)
- [ ] First deploy test: verify all containers start and connect to Data Plane

**Day 5 — Start MVP Coding**:
- [ ] Product CRUD + image upload to MinIO
- [ ] Photoroom API integration
- [ ] Begin catalog PWA (product listing, detail page)

**Total: 4 days of setup, then coding starts on day 5.**

### 3.3 Confirmed: Nothing Else Is Missing

The system is fully defined:
- **89 features** classified by type (73 deterministic, 13 LLM, 3 external API)
- **3 product tiers** (Starter $8, Pro $15, Business $25) from one codebase
- **Deployment** on existing Coolify infrastructure (2 new containers)
- **Catalog** on Cloudflare Workers (edge SSR, free-$5/mo)
- **Billing** via Pago Movil/Zelle (no Stripe)
- **Observability** via AgentOS built-in + UptimeRobot
- **LLM costs** at $0.61/merchant/month (GPT-5 Mini + Groq + Photoroom)
- **Infrastructure cost** at $0/month additional (uses existing Hetzner planes)
- **External services** at ~$46/month for 200 users
- **Roadmap** from zero to 1,000 users in 12 months

The planning phase is complete. The next step is execution.
