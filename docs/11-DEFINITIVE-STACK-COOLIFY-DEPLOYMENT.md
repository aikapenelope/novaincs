# Nova — CORRECTION: Standalone Infrastructure, Not Shared

> **Status**: Planning Phase — CORRECTION  
> **Last Updated**: May 2026  
> **Replaces**: Document 11 (which incorrectly placed Nova on the existing platform-infra)

---

## The Correction

Document 11 was wrong. It placed Nova on the existing 3-plane Hetzner architecture (Control Plane, Data Plane, App Plane A) shared with Whabi, Docflow, and Aurora. That contradicts the core design principle: **Nova is a composable, standalone product with its own infrastructure.** It does not share servers, databases, or deployment pipelines with the other projects.

The existing platform-infra already has `nova.ts` with connection strings pointing to the shared Data Plane. That file was created as a placeholder. **Nova will NOT use those shared resources for production.** Nova gets its own server, its own PostgreSQL, its own Redis, its own MinIO.

---

## 1. Why Standalone

- **Nova is a multi-tenant SaaS** serving hundreds/thousands of external merchants. Whabi, Docflow, and Aurora are single-tenant internal tools. Different risk profile.
- **A bug in Nova should never affect Docflow's patient records** or Whabi's CRM data. Resource isolation prevents cascading failures.
- **Nova scales independently.** When Nova hits 1,000 merchants, it needs more resources. That shouldn't require resizing the server that runs Docflow.
- **Composable architecture means each product owns its infrastructure.** That's the whole point.

---

## 2. Nova's Infrastructure

### One Server: Hetzner CX32

| Component | Spec | Cost |
|---|---|---|
| **Hetzner CX32** | 4 vCPU, 8 GB RAM, 80 GB NVMe | $8.49/mo |
| **Backups** | Automated (20% of server cost) | $1.70/mo |
| **Block Storage** | 50 GB (product images, imports) | $2.60/mo |
| **Total** | | **$12.79/mo** |

Location: Ashburn (ash) — lowest latency to Venezuela (~60ms).

### What Runs on It

**5 containers**, managed by Coolify (a separate Coolify instance on this server, or Docker Compose directly):

```
Nova CX32 (Ashburn)
├── nova-app          (Hono API + BullMQ workers + Agno agents)  ~2.5 GB
├── nova-dashboard    (Nuxt 3 SSR, merchant PWA)                 ~512 MB
├── postgres          (PostgreSQL 16 + pgvector, DB: nova)        ~2 GB
├── redis             (Redis 7, cache + queues)                   ~512 MB
└── caddy             (reverse proxy, auto-SSL)                   ~128 MB
                                                          Total: ~5.6 GB / 8 GB
```

MinIO is NOT a separate container. Product images and uploads go to **Cloudflare R2** (S3-compatible, $0.015/GB/mo, free egress) or to the block storage volume served directly by Caddy. This saves ~512 MB of RAM and simplifies the stack.

### Deployment: Coolify or Docker Compose?

**Option A: Coolify on the same server (recommended)**

Install Coolify on the CX32 itself. It's lightweight (~300 MB RAM). You get:
- Git-based auto-deploy (push to main → Coolify builds and restarts)
- SSL via built-in Traefik
- Environment variable management
- Container monitoring dashboard
- Same workflow you already know from platform-infra

This is the simplest path. One server, Coolify manages everything on it.

**Option B: Docker Compose + GitHub Actions**

If you don't want Coolify overhead on the same server:
- Docker Compose manages the containers
- Caddy handles SSL (auto Let's Encrypt)
- GitHub Actions builds Docker images, pushes to GitHub Container Registry, SSHs into the server, pulls and restarts
- No web dashboard for container management (CLI only)

**Recommendation: Option A (Coolify).** The 300 MB overhead is worth the deployment convenience. You already know Coolify. Don't introduce a new deployment workflow for Nova.

### Catalog: Cloudflare Workers (Unchanged)

The buyer-facing catalog PWA deploys to Cloudflare Workers. This is separate from the Hetzner server. The Worker fetches data from the Nova API on Hetzner via HTTP.

```
Buyer → Cloudflare Worker (edge, ~30ms) → Nova API (Hetzner Ashburn) → PostgreSQL
```

---

## 3. Complete Stack (Corrected)

```
NOVA INFRASTRUCTURE (standalone, NOT shared with platform-infra)
═══════════════════════════════════════════════════════════════

Hetzner CX32 (Ashburn, $12.79/mo)
├── Coolify (deployment management + Traefik for SSL)
├── nova-app container
│   ├── Hono 4.x (API framework)
│   ├── Drizzle ORM (PostgreSQL access)
│   ├── BullMQ workers (background jobs)
│   ├── Agno AgentOS (AI agents)
│   ├── Prefect worker (scheduled flows)
│   └── Clerk SDK (auth middleware)
├── nova-dashboard container
│   ├── Nuxt 3 (SSR)
│   ├── Tailwind CSS 4
│   ├── Shadcn-vue
│   └── @vite-pwa/nuxt
├── PostgreSQL 16 + pgvector container
│   ├── DB: nova (single database, multi-tenant via RLS)
│   └── Extensions: vector, uuid-ossp
├── Redis 7 container
│   ├── Cache (sessions, hot data)
│   └── BullMQ queues (jobs)
└── Caddy container (if not using Coolify's Traefik)

Cloudflare (free-$5/mo)
├── Workers: nova-catalog (Nuxt 3 SSR at edge)
├── DNS: nova.app (or chosen domain)
└── CDN: static assets

External Services (~$46/mo for 200 users)
├── Clerk: auth (free tier)
├── Resend: email (free tier)
├── OpenAI: GPT-5 Mini ($3/mo)
├── Groq: Whisper + Llama ($2/mo)
├── Photoroom: images ($40/mo)
├── Google Cloud: Sheets API service account (free)
└── Cloudflare R2: image storage ($0.015/GB/mo, ~$1/mo)

TOTAL: ~$59/mo for 200 users
```

---

## 4. What About the Existing platform-infra/nova.ts?

The `nova.ts` file in platform-infra defines connection strings to the shared Data Plane. For Nova's standalone deployment, this file is **not used**. Nova has its own PostgreSQL on its own server.

If in the future Nova needs to share data with Aurora or Docflow (e.g., a merchant uses both), that would be done via API calls between the systems, not by sharing a database. Each product owns its data.

---

## 5. Updated Pre-Coding Checklist

| Day | Task |
|---|---|
| **1** | Founder decisions (name, domain). Create accounts (Cloudflare, Clerk, Resend, OpenAI, Groq, Photoroom, Google Cloud). |
| **2** | Provision Hetzner CX32 in Ashburn. Install Coolify. Configure domain + DNS in Cloudflare. Attach 50 GB block storage. |
| **3** | Initialize monorepo (pnpm + turborepo). Scaffold apps (api, dashboard, catalog) + packages (shared, ui). Configure linting. |
| **4** | Write Drizzle schema. Run migrations on Nova's PostgreSQL. Integrate Clerk auth. Write RLS tests. |
| **5** | Configure Coolify services (nova-app, nova-dashboard). Deploy catalog to Cloudflare Workers. First end-to-end test. |
| **6** | Start MVP coding: Product CRUD + image upload + Photoroom integration. |

---

## 6. Final Confirmation: Nothing Missing

| Category | Status |
|---|---|
| Product vision (11 docs) | Complete |
| 89 features classified | Complete |
| 3 product tiers | Complete |
| LLM model selection + costs | Complete |
| Standalone infrastructure | **Corrected in this document** |
| Deployment via Coolify | Complete |
| Catalog on Cloudflare Workers | Complete |
| Billing via Pago Movil/Zelle | Complete |
| Observability via AgentOS | Complete |
| Pre-coding checklist | Complete |

The planning phase is complete. Nova has its own infrastructure, its own deployment, and its own scaling path — independent of the existing platform.
