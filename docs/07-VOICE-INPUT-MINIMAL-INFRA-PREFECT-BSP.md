# Nova — Addendum: Voice-to-Data Input, Minimal Infrastructure, Prefect vs Temporal, BSP Architecture

> **Status**: Planning Phase  
> **Last Updated**: May 2026  
> **Scope**: Unstructured data ingestion ("just tell me what happened today"), minimal infrastructure for first 200 users, Prefect as Temporal replacement, BSP system architecture, and system extensibility assessment.

---

## Table of Contents

1. [Voice-to-Data: The Merchant Just Talks](#1-voice-to-data-the-merchant-just-talks)
2. [Minimal Infrastructure: First 200 Users](#2-minimal-infrastructure-first-200-users)
3. [Prefect Instead of Temporal](#3-prefect-instead-of-temporal)
4. [BSP Architecture: How Nova Manages WhatsApp for Everyone](#4-bsp-architecture-how-nova-manages-whatsapp-for-everyone)
5. [System Extensibility: Final Assessment](#5-system-extensibility-final-assessment)

---

## 1. Voice-to-Data: The Merchant Just Talks

### The Concept

The merchant doesn't fill forms. They talk, type, or upload a document. The system figures out what they meant and organizes it.

This is not "too much." This is the natural evolution of the agent-native architecture. The agents already have access to all the merchant's data (products, customers, orders, inventory, finances). Adding unstructured input is just another tool for the agents.

### How It Works: Three Input Modes

#### Mode 1: Voice Note

The merchant records a voice note in the app (or sends one via WhatsApp if Wakit is connected):

```
Merchant says: "Hoy vendí 5 camisas polo azules a Juan Pérez por 75 dólares,
me pagó con Pago Móvil. También me llegaron 20 camisas nuevas del proveedor
y le pagué 200 dólares. Ah, y María llamó preguntando por los zapatos Nike
pero no compró."
```

The system:
1. **Groq Whisper** transcribes the audio to text (< 1 second)
2. **Support Agent** (Claude Haiku, fast and cheap) parses the text and extracts structured actions:
   - Create order: 5x Camisa Polo Azul, customer: Juan Pérez, $75, Pago Móvil, status: paid
   - Inventory adjustment: +20 Camisa (new stock from supplier)
   - Log expense: $200 to supplier (inventory purchase)
   - Customer note: María asked about Nike shoes, didn't buy (tag: "Window Shopper")
3. Agent presents the parsed actions for confirmation:

```
Entendí esto de lo que me dijiste:

✅ Venta: 5 Camisas Polo Azul a Juan Pérez — $75 (Pago Móvil)
✅ Inventario: +20 Camisas nuevas del proveedor
✅ Gasto: $200 al proveedor (compra de inventario)
✅ Nota: María preguntó por Zapatos Nike, no compró

¿Todo correcto? [Confirmar todo] [Editar]
```

The merchant taps "Confirmar todo." Five database operations execute in one tap.

#### Mode 2: Free Text

Same as voice but typed. The merchant opens the AI Command Center and types:

```
"vendí 3 bolsos coach a ana lopez, 186 dolares, zelle. quedan 2 en stock"
```

The agent parses, confirms, executes. No forms, no dropdowns, no sub-menus.

#### Mode 3: Document Upload

The merchant uploads a photo of a receipt, an invoice from a supplier, or a spreadsheet from a POS system like Cetux.

**For receipts/invoices** (photo):
1. OCR (Tesseract.js or Google Vision) extracts text from the image
2. Agent parses the extracted text into structured data (supplier name, items, quantities, amounts)
3. Agent presents for confirmation, then records as expense + inventory adjustment

**For POS exports** (CSV/Excel from Cetux or similar):
1. The same MCP Migration Agent from doc 03 handles this
2. AI detects column mappings
3. Validates and cleans
4. Merchant confirms
5. Data imports as sales records, inventory adjustments, or customer data

**For Cetux specifically**: Cetux exports sales data as CSV. The merchant downloads the CSV from Cetux, uploads it to Nova, and the Migration Agent maps Cetux's columns (producto, cantidad, precio, fecha, cliente) to Nova's schema. This is a one-time mapping — after the first import, Nova remembers the Cetux format and future imports are one-tap.

### Cost of Voice-to-Data

| Component | Cost per Interaction | Notes |
|---|---|---|
| Groq Whisper (transcription) | ~$0.001 per minute of audio | Negligible |
| Claude Haiku (parsing) | ~$0.0005 per parse | ~200 input tokens + 100 output tokens |
| Total per voice note | **~$0.002** | At 50 voice notes/day per merchant = $0.10/day = $3/month |

At 200 merchants using voice input 10 times/day: $0.002 x 10 x 200 x 30 = **$12/month**. Trivial.

---

## 2. Minimal Infrastructure: First 200 Users

### Why the Previous Spec Was Oversized

The CCX33 (8 vCPU, 32GB RAM, ~$50/month) was sized for 1,000 users. For the first 200 users, that's overkill. Here's the right-sized plan:

### The Minimal Setup: One CX32

| Component | Spec | Cost |
|---|---|---|
| **Hetzner CX32** | 4 vCPU, 8 GB RAM, 80 GB NVMe | **$8.49/month** |
| **Backups** | Automated, 20% of server cost | $1.70/month |
| **Block Storage** | 50 GB (for MinIO images) | $2.60/month |
| **Total Infrastructure** | | **$12.79/month** |

### What Runs on the CX32

Not 10 separate containers. **5 containers** that consolidate services:

```yaml
services:
  # 1. The Application (API + Workers + Agents — ONE process)
  nova:
    image: nova/app:latest
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://nova:***@postgres:5432/nova
      REDIS_URL: redis://redis:6379
      MODE: all  # runs API server + BullMQ workers + Agno agents in one process
    mem_limit: 3g

  # 2. PostgreSQL (with pgvector)
  postgres:
    image: pgvector/pgvector:pg16
    volumes: ["pgdata:/var/lib/postgresql/data"]
    shm_size: "128mb"
    mem_limit: 2g
    command: >
      postgres
        -c shared_buffers=512MB
        -c effective_cache_size=1GB
        -c work_mem=16MB
        -c max_connections=100

  # 3. Redis (cache + queues)
  redis:
    image: redis:7-alpine
    volumes: ["redisdata:/data"]
    mem_limit: 512m
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru

  # 4. MinIO (images)
  minio:
    image: minio/minio:latest
    volumes: ["/mnt/storage:/data"]  # block storage mounted here
    mem_limit: 512m
    command: server /data --console-address ":9001"

  # 5. Caddy (reverse proxy + auto SSL)
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes: ["./Caddyfile:/etc/caddy/Caddyfile", "caddy_data:/data"]
    mem_limit: 128m
```

**Key simplification**: The Nova app runs as ONE Node.js process that handles:
- Hono API server (HTTP requests)
- Nuxt SSR (server-side rendering for catalog and dashboard)
- BullMQ workers (background jobs: image processing, event processing, reports)
- Agno agents (AI agent invocations, on-demand, not always running)

This is possible because Node.js is single-threaded with async I/O. One process can handle API requests AND process background jobs using BullMQ's worker mode. The agents only consume resources when invoked (they're not running 24/7 — they're called on-demand via API).

**Caddy instead of Traefik**: Caddy is simpler, auto-configures SSL with zero configuration, and uses less memory. For a single-server setup, Caddy is the right choice. Traefik is for multi-server orchestration.

### Memory Budget (8 GB Total)

| Component | Allocated | Notes |
|---|---|---|
| Nova app (API + workers + agents) | 3 GB | Node.js with BullMQ workers |
| PostgreSQL | 2 GB | 512MB shared_buffers + query cache |
| Redis | 512 MB | 256MB data + overhead |
| MinIO | 512 MB | Minimal, mostly I/O bound |
| Caddy | 128 MB | Reverse proxy, very light |
| OS + Docker overhead | 1.3 GB | Linux kernel, Docker daemon |
| **Total** | **~7.5 GB** | Fits in 8 GB with headroom |

### External Services for 200 Users

| Service | Usage | Monthly Cost |
|---|---|---|
| Clerk (auth) | 200 MAU | Free (10K MAU free tier) |
| Resend (email) | ~1,000 emails/month | Free (3K free tier) |
| Photoroom API (images) | ~2,000 images/month | ~$40 |
| Claude Haiku (agents) | ~200K tokens/month | ~$3 |
| Groq (whisper + fast LLM) | ~50K tokens/month | ~$2 |
| Domain | 1 | ~$1.25/month ($15/year) |
| **Total External** | | **~$46/month** |

### Total Cost for 200 Users

| Category | Monthly Cost |
|---|---|
| Hetzner (server + backup + storage) | $12.79 |
| External services | $46.00 |
| **Total** | **$58.79/month** |

**Revenue at 200 users** (assuming 40% free, 40% Starter $8, 15% Pro $15, 5% Business $25):
- 80 free + 80 x $8 + 30 x $15 + 10 x $25 = **$1,340/month**

**Margin: 95.6%** — even at 200 users, the economics work.

### When to Upgrade

| Signal | Action |
|---|---|
| CPU sustained > 70% for 1 hour | Upgrade to CX42 (8 vCPU, 16 GB, $16.49/mo) |
| RAM usage > 85% | Upgrade to CX42 |
| Disk > 70 GB | Add more block storage ($0.052/GB/mo) |
| 500+ merchants | Consider separating DB to its own server |
| 1,000+ merchants | Move to the CCX33 dedicated plan from doc 06 |

Hetzner upgrades are live — you click "resize" in the console and the server upgrades in minutes with no data loss.

---

## 3. Prefect Instead of Temporal

### Why Prefect Is the Right Choice for Nova

You're right. Temporal is heavy. It requires its own server cluster (Temporal Server + persistence layer + Elasticsearch), adds significant operational complexity, and its learning curve is steep (2-4 weeks to understand the durable execution paradigm).

For Nova's use cases, **Prefect is the better fit**:

| Criterion | Temporal | Prefect | Winner for Nova |
|---|---|---|---|
| **Infrastructure** | Requires its own server cluster | Single PostgreSQL instance (we already have it) | **Prefect** |
| **Language** | Go, Java, Python, TypeScript | Python (with decorators) | Tie (we use both TS and Python) |
| **Learning curve** | Steep (new paradigm, 2-4 weeks) | Moderate (Python decorators, 2-3 days) | **Prefect** |
| **Self-hosted cost** | High (separate server + DB + Elasticsearch) | Low (uses existing PostgreSQL) | **Prefect** |
| **Cloud cost** | $200/month minimum | Free tier available, ~$500/mo for Pro | **Prefect** (self-hosted free) |
| **Use cases** | Mission-critical distributed systems | Data pipelines, scheduled jobs, ETL | **Prefect** (our jobs are pipelines) |
| **Durable execution** | Yes (survives crashes, replays state) | No (retries tasks, doesn't replay state) | Temporal (but we don't need this) |
| **Complexity** | High | Low-Medium | **Prefect** |

### What We Lose by Dropping Temporal

The only thing Temporal gives that Prefect doesn't is **durable execution** — if a workflow crashes mid-step, Temporal replays from the exact state. Prefect retries the failed task but doesn't replay the entire workflow.

**Do we need durable execution?** For Nova's current use cases, no:

| Workflow | Needs Durable Execution? | Why Not |
|---|---|---|
| Image processing | No | If it fails, just retry. No state to preserve. |
| Report generation | No | If it fails, regenerate from scratch. Idempotent. |
| WhatsApp broadcast | Partially | BullMQ already handles retries per message. |
| Payment verification (OCR) | No | If it fails, merchant verifies manually. Fallback exists. |
| RFM score calculation | No | Batch job, runs hourly. If it fails, next run catches up. |
| Data migration | No | Atomic transaction. Either all rows import or none do. |

If Nova ever needs true durable execution (e.g., for embedded finance — processing loans, insurance claims), Temporal can be added later for those specific workflows without replacing Prefect for everything else.

### What Replaces Temporal in the Architecture

```
BEFORE (with Temporal):
  Scheduled jobs → Temporal Cron Workflows → Activities → PostgreSQL
  Critical workflows → Temporal Durable Workflows → Activities → PostgreSQL

AFTER (with Prefect + BullMQ):
  Scheduled jobs → Prefect Flows (cron) → Tasks → PostgreSQL
  Background jobs → BullMQ Workers → PostgreSQL
  Critical sequences → BullMQ with retry + dead letter queue → PostgreSQL
```

**Prefect handles**: Scheduled flows (daily briefing, hourly RFM, monthly reports, exchange rate checks). These are Python scripts with `@flow` and `@task` decorators.

**BullMQ handles**: Real-time background jobs (image processing, event ingestion, WhatsApp message sending). These are TypeScript workers that already exist in the architecture.

**Together they replace Temporal** without the operational overhead of running a separate Temporal cluster.

### Prefect Self-Hosted on the Same Server

Prefect Server runs as a lightweight Python process with a PostgreSQL backend (the same PostgreSQL we already have):

```yaml
  # Add to docker-compose.yml
  prefect:
    image: prefecthq/prefect:3-python3.12
    command: prefect server start --host 0.0.0.0
    environment:
      PREFECT_API_DATABASE_CONNECTION_URL: postgresql+asyncpg://nova:***@postgres:5432/prefect
    mem_limit: 512m
    ports: ["4200:4200"]  # Prefect UI (optional, for debugging)
```

This adds ~512MB RAM to the server. On the CX32 (8GB), we adjust the Nova app from 3GB to 2.5GB. Still fits comfortably.

---

## 4. BSP Architecture: How Nova Manages WhatsApp for Everyone

### What a BSP Is

A BSP (Business Solution Provider) is an official Meta partner that provides access to the WhatsApp Business API with added tooling. Think of it as: **Meta owns the highway, the BSP operates the toll booth and gas stations.**

Nova can operate in two modes:

### Mode 1: Direct Cloud API (Simpler, for MVP)

Each merchant connects their own WhatsApp number directly through Meta's Cloud API:

```
Merchant → Meta Business Suite → Creates WABA → Configures webhook → Nova receives messages
```

**How it works**:
1. Merchant goes to Meta Business Suite, creates a WhatsApp Business Account (WABA)
2. Registers their phone number
3. In Nova settings, enters their WABA ID and System User Access Token
4. Nova configures the webhook URL: `https://api.nova.app/webhooks/whatsapp`
5. Meta sends all messages for that number to Nova's webhook
6. Nova routes by WABA ID to the correct tenant

**Pros**: No BSP registration needed. No intermediary costs. Direct Meta pricing.
**Cons**: Each merchant must navigate Meta Business Suite (confusing for non-technical users).

### Mode 2: Nova as BSP (Better UX, for Scale)

Nova registers as an official Meta BSP and offers **Embedded Signup** — a one-click flow where the merchant connects their WhatsApp number without leaving Nova:

```
Merchant → Nova Settings → "Connect WhatsApp" → Embedded Signup popup → Done
```

**How Embedded Signup works**:
1. Merchant clicks "Connect WhatsApp" in Nova settings
2. A Meta popup opens (OAuth-style)
3. Merchant logs into their Facebook account
4. Selects or creates a WhatsApp Business Account
5. Registers their phone number
6. Authorizes Nova to manage their WhatsApp
7. Nova automatically receives the WABA ID, phone number ID, and access token
8. Webhook is auto-configured. Messages start flowing immediately.

**The merchant never touches Meta Business Suite.** They click one button, log into Facebook, and they're connected.

**Pros**: Seamless UX. Merchant doesn't need to understand Meta's infrastructure.
**Cons**: Requires Nova to be registered as a Meta Technology Provider (application process, takes 2-4 weeks).

### The Webhook Routing System

Regardless of mode, all webhooks arrive at one URL:

```
https://api.nova.app/webhooks/whatsapp
```

Nova's webhook handler:

```
1. Receive POST from Meta
2. Verify X-Hub-Signature-256 (security — confirms it's really from Meta)
3. Extract WABA ID from payload.entry[0].id
4. Look up tenant by WABA ID in database
5. If found: queue message for processing (BullMQ)
6. If not found: log and ignore (orphaned webhook)
7. Return 200 OK to Meta (must respond within 5 seconds)
```

The BullMQ worker then:
```
1. Dequeue message
2. Set tenant context (for RLS)
3. Parse message type (text, image, location, etc.)
4. Match sender to customer (by phone or BSUID)
5. Create/update customer record
6. Store message event
7. If AI agent is enabled: invoke Agno agent with tenant context
8. If AI agent responds: send reply via WhatsApp Cloud API
```

### Cost Structure as BSP

Nova doesn't add markup on Meta's per-message pricing. The WhatsApp integration is a feature of the paid plans, not a revenue center. Revenue comes from subscriptions.

| Item | Who Pays | Cost |
|---|---|---|
| Meta per-message fees | Merchant (billed by Meta directly) | ~$0.008/utility, ~$0.063/marketing |
| Nova WhatsApp feature | Merchant (included in Pro/Business plan) | $0 extra |
| Nova infrastructure for webhooks | Nova (absorbed in server costs) | Negligible |

---

## 5. System Extensibility: Final Assessment

### Can the System Keep Growing?

**Yes. Here's the proof by architecture:**

Every component in the system is independently replaceable and extensible:

| If You Want To Add... | You Touch... | Everything Else Stays |
|---|---|---|
| New AI agent (e.g., "Logistics Agent") | Add one Python file with Agno Agent definition | API, DB, UI, other agents unchanged |
| New data source (e.g., Cetux POS) | Add one MCP tool to the Migration MCP Server | Agent, DB, UI unchanged |
| New payment method (e.g., Binance Pay) | Add one payment handler in the checkout flow | Cart, CRM, inventory unchanged |
| New report type (e.g., tax report) | Add one Prefect flow + one PDF template | Existing reports unchanged |
| New UI section (e.g., supplier management) | Add Nuxt pages + API endpoints | Existing UI unchanged |
| New integration (e.g., Instagram DMs) | Add webhook handler + message parser | WhatsApp integration unchanged |
| New plan tier (e.g., "Enterprise") | Add feature flag definitions | Existing tiers unchanged |
| New language (e.g., Portuguese for Brazil) | Add i18n translations | Code unchanged |

### The Three Product Paths (Confirmed)

The system serves three customer types from one codebase:

```
                    ┌─────────────────────┐
                    │    NOVA CODEBASE     │
                    │   (one deployment)   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐
     │ NOVA STARTER  │ │  NOVA PRO    │ │ NOVA BUSINESS│
     │               │ │  (ERP-Lite)  │ │ (WA Agent)   │
     │ Catalog       │ │ + CRM full   │ │ + WA inbox   │
     │ Checkout      │ │ + Finance    │ │ + AI agent   │
     │ Inventory     │ │ + Expenses   │ │ + API access  │
     │ Basic CRM     │ │ + Suppliers  │ │ + Autonomous  │
     │ AI images     │ │ + Custom flds│ │ + Voice cmds  │
     │               │ │ + Reports    │ │ + Integrations│
     │ $0-8/mo       │ │ $15/mo       │ │ $25/mo        │
     └───────────────┘ └──────────────┘ └──────────────┘
```

Each path adds features via feature flags. No code forks. No separate deployments. The merchant upgrades their plan and new features appear instantly.

### What Would Break This System?

Honestly, very little:

| Scenario | Impact | Mitigation |
|---|---|---|
| Meta changes WhatsApp API drastically | Webhook handler needs updating | MCP abstraction layer isolates the change |
| Agno framework is abandoned | Need to migrate agents | Agents are Python functions with tools — portable to any framework |
| PostgreSQL can't handle the load | Need to scale database | Partition tables, add read replicas, or move to Citus. Schema doesn't change. |
| A competitor copies the features | They can't copy the data | 12-18 months of behavioral data is the real moat |
| AI costs spike | Margins decrease | Switch LLM providers (Agno is model-agnostic). Use smaller models for simple tasks. |

The architecture is designed so that **no single component failure kills the product**. Every piece can be replaced without rewriting the rest.

### Final Word

The system as designed across all seven documents is:

- **Complete** for launch (89 features, 10 modules, 3 tiers)
- **Minimal** for first deployment (1 server, 5 containers, $59/month)
- **Extensible** for unlimited growth (composable, API-first, agent-native)
- **Defensible** for 3-4 years (data moat, AI moat, integration moat, network moat)
- **Economically viable** from day one (95%+ margins even at 200 users)

It can grow into an ERP-lite, a WhatsApp agent platform, or stay as a simple catalog-and-sell tool — all from the same codebase, the same server, the same database. The merchant's plan determines what they see. The architecture determines what's possible. And what's possible is essentially unlimited.
