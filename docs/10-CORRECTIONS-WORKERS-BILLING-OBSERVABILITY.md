# Nova — Corrections & Clarifications: Workers, Meta, ClickHouse, Observability, Billing

> **Status**: Planning Phase  
> **Last Updated**: May 2026  
> **Scope**: Technical clarifications on Cloudflare Workers architecture, Meta Business Suite role, ClickHouse justification, AgentOS observability, and billing without Stripe.

---

## 1. Cloudflare Workers: Not a Mirror, a Separate App

### What Workers Are NOT

Workers are **not** a CDN mirror, cache, or proxy of Hetzner. They don't copy content from your server and serve it closer to the user. That's what a CDN does (and Cloudflare also offers that, but it's a different product).

### What Workers ARE

A Cloudflare Worker is a **separate application** that runs your code on Cloudflare's edge network (300+ locations worldwide). When you deploy Nuxt 3 to Workers, the entire Nuxt SSR engine runs on Cloudflare's servers, not on Hetzner.

### How It Works for Nova

```
STEP 1: You build the catalog Nuxt app
  $ cd apps/catalog && nuxt build --preset cloudflare-workers

STEP 2: You deploy to Cloudflare
  $ wrangler deploy
  → Cloudflare distributes your app to 300+ edge locations worldwide

STEP 3: A buyer in Caracas visits carlos-fashion.nova.app
  → DNS resolves to Cloudflare (not Hetzner)
  → The nearest Cloudflare POP (Miami, ~30ms from Caracas) runs the Nuxt app
  → Nuxt SSR renders the product page HTML
  → But Nuxt needs product data... where does it get it?

STEP 4: The Worker fetches data from your API on Hetzner
  → Worker makes HTTP request to api.nova.app/v1/catalog/carlos-fashion/products
  → api.nova.app points to Hetzner (Ashburn)
  → Hetzner responds with JSON product data
  → Worker renders the HTML with that data
  → Worker sends the complete HTML page to the buyer

STEP 5: Caching makes it fast
  → The Worker caches the API response for 60 seconds
  → Next buyer who visits the same page gets the cached version
  → No API call to Hetzner needed
  → Response time: ~30ms (pure edge, no origin hit)
```

### The Flow Diagram

```
Buyer in Caracas
    │
    │ HTTPS request (carlos-fashion.nova.app)
    │ ~30ms to Miami
    ▼
Cloudflare Worker (Miami POP)
    │
    │ Has cached data? ──YES──> Render HTML, return to buyer (30ms total)
    │         │
    │         NO
    │         │
    │         ▼
    │   HTTP fetch to api.nova.app (Hetzner Ashburn)
    │   ~20ms Miami→Ashburn
    │         │
    │         ▼
    │   Hono API → PostgreSQL → JSON response
    │         │
    │         ▼
    │   Cache response for 60 seconds
    │   Render HTML with data
    │         │
    ▼         ▼
Return HTML to buyer (~80ms total on cache miss, ~30ms on cache hit)
```

### What Lives Where

| Component | Where It Runs | Why |
|---|---|---|
| Catalog PWA (Nuxt SSR) | **Cloudflare Workers** | Edge rendering, fast for buyers globally |
| Dashboard PWA (Nuxt SSR) | **Hetzner** (your existing infra) | Needs direct DB access, agents, workers |
| Hono API | **Hetzner** | Direct PostgreSQL/Redis access |
| PostgreSQL, Redis, MinIO | **Hetzner** | Data stays on your server |
| Agno Agents | **Hetzner** | Need DB access + LLM API calls |
| Prefect | **Hetzner** | Scheduled jobs need DB access |

### Deployment Process

The catalog app is deployed separately from the rest:

```bash
# Deploy catalog to Cloudflare Workers
cd apps/catalog
nuxt build --preset cloudflare-workers
wrangler deploy

# Deploy everything else to Hetzner
cd apps/api
docker build -t nova/api .
docker push registry/nova/api
ssh hetzner "docker compose pull && docker compose up -d"
```

This happens automatically via GitHub Actions on merge to main. Two deployment targets, one CI/CD pipeline.

---

## 2. Meta Business Suite: What It's For and When

### What It Is

Meta Business Suite is Meta's admin panel for managing Facebook Pages, Instagram accounts, and WhatsApp Business accounts. It's where you:
- Create a WhatsApp Business Account (WABA)
- Register a phone number for WhatsApp Business API
- Submit message templates for approval
- View messaging analytics
- Manage billing for WhatsApp API usage

### When Nova Needs It

| Phase | Need Meta Business Suite? | Why |
|---|---|---|
| **MVP** | **No** | MVP uses WhatsApp deep links (`wa.me/...?text=...`). These are just URLs. No API, no Meta account needed. |
| **Phase 3** | **Yes** | When Nova integrates WhatsApp Cloud API for broadcasts, chatbot, and automated messages, each merchant needs a WABA. Nova can handle this via Embedded Signup (the merchant clicks a button in Nova, Meta popup opens, they authorize). |

**For MVP: remove Meta Business Suite from the setup checklist entirely.** It's not needed until Phase 3 (months 7-9).

---

## 3. ClickHouse: What It's For and Why It's Phase 3+

### What ClickHouse Is

ClickHouse is a columnar database optimized for analytical queries on large datasets. It's 10-100x faster than PostgreSQL for queries like "show me the top 10 products by revenue across all merchants for the last 90 days."

### Why It Was in the Plan

At 25,000+ merchants, the `customer_events` table will have billions of rows. PostgreSQL can handle this with partitioning, but analytical queries (aggregations across millions of rows) get slow. ClickHouse compresses data 10-20x and runs analytical queries in milliseconds.

### Why It's NOT Needed Now

For the first 1,000-5,000 merchants, PostgreSQL handles everything. The `customer_events` table with monthly partitioning and proper indexes handles analytical queries in <100ms at this scale. ClickHouse adds operational complexity (another database to manage) for zero benefit at small scale.

### When to Add It

**Only when PostgreSQL analytical queries exceed 1 second consistently.** This likely happens around 10,000-25,000 merchants. At that point, set up ClickHouse as a read-only analytical replica — events are written to PostgreSQL (source of truth) and replicated to ClickHouse (analytics engine).

**For now: remove ClickHouse from all planning. It's a future optimization, not a requirement.**

---

## 4. Observability: AgentOS Has It Built-In

### What AgentOS Provides

Agno's AgentOS runtime includes built-in observability:

- **OpenTelemetry tracing**: Every agent invocation, tool call, and LLM request is traced automatically
- **Run history**: Every agent run is logged with inputs, outputs, token usage, and duration
- **Session management**: Persistent sessions per user with full conversation history
- **Audit logs**: Who invoked what agent, when, with what result
- **AgentOS UI**: Web-based control plane at `os.agno.com` that connects to your running AgentOS

### What This Means for Nova

We don't need to set up separate observability for the agent layer. AgentOS handles:
- Tracing agent calls (which agent, which tools, which LLM, how many tokens)
- Monitoring agent performance (latency, success rate, error rate)
- Debugging agent behavior (replay any run, inspect every step)

### What We Still Need for Non-Agent Observability

For the API, database, and infrastructure (not agents), we need basic monitoring:
- **UptimeRobot** (free): checks if the API is responding every 5 minutes
- **Docker logs**: `docker compose logs -f` for debugging
- **PostgreSQL `pg_stat_statements`**: identifies slow queries
- **Caddy access logs**: HTTP request logs

This is minimal and sufficient for the first 1,000 users. No Grafana, no Prometheus, no OpenTelemetry stack needed at this scale. AgentOS covers the agent layer, basic tools cover the rest.

---

## 5. Billing: Without Stripe, Like Aurora and Docflow

### How Aurora and Docflow Handle It

Based on the infrastructure review, Aurora and Docflow are deployed on the same Hetzner infrastructure via Coolify, using the shared PostgreSQL/Redis/MinIO data plane. They are **direct-to-customer products**, not SaaS platforms with subscription billing. They don't use Stripe because their customers (Venezuelan businesses) pay via Pago Movil and Zelle — the same payment methods Nova's end-customers use.

### How Nova Should Handle Billing

Nova's merchants pay for their Nova subscription the same way their customers pay for products: **Pago Movil and Zelle**.

```
BILLING FLOW:

1. Merchant signs up (free tier, no payment needed)
2. Merchant wants to upgrade to Pro ($15/month)
3. Nova shows: "Para activar Nova Pro, realiza un pago de $15 a:"
   - Pago Movil: [Nova's bank details]
   - Zelle: [Nova's Zelle email]
4. Merchant pays and uploads screenshot (same flow as their customers!)
5. Nova verifies payment (OCR or manual)
6. Plan activated for 30 days
7. 3 days before expiry: "Tu plan vence en 3 dias. Renueva para seguir usando Nova Pro."
8. Merchant pays again → renewed for another 30 days
```

### Implementation

```sql
-- Subscription tracking
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    plan VARCHAR(50) NOT NULL,           -- 'starter', 'pro', 'business'
    status VARCHAR(50) NOT NULL,          -- 'active', 'expired', 'grace_period'
    started_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    payment_method VARCHAR(50),           -- 'pago_movil', 'zelle', 'manual'
    last_payment_at TIMESTAMPTZ,
    last_payment_amount DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Payment records for subscriptions (reuses the same payment verification flow)
CREATE TABLE subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    subscription_id UUID REFERENCES subscriptions(id),
    amount DECIMAL(12,2) NOT NULL,
    method VARCHAR(50) NOT NULL,
    screenshot_url TEXT,                  -- MinIO path
    reference VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'verified', 'rejected'
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Why This Works

1. **Same UX the merchant already knows**: They pay for Nova the same way their customers pay them. No new payment method to learn.
2. **No Stripe fees**: Stripe charges 2.9% + $0.30 per transaction. On a $15 subscription, that's $0.74/month per merchant. At 1,000 merchants, that's $740/month saved.
3. **No international payment friction**: Many Venezuelan merchants don't have international credit cards. Pago Movil and Zelle are universal.
4. **OCR verification reuse**: The same OCR system that verifies customer payments can verify subscription payments. One system, two uses.

### Grace Period Logic

```
Plan expires → 3-day grace period (features still work, banner shows "Renueva tu plan")
Grace period expires → Downgrade to free tier (data preserved, premium features locked)
Merchant pays → Immediately re-activated
```

No data is ever deleted. The merchant just loses access to premium features until they pay. This is critical — losing data would destroy trust.

### Future: When Scale Demands Automation

At 5,000+ merchants, manually verifying 5,000 subscription payments per month becomes unsustainable. At that point, options include:
- **Automated OCR verification** (already built for customer payments)
- **Bank API integration** (if Venezuelan banks offer APIs by then)
- **Crypto payments** (USDT/USDC via a simple wallet integration)
- **Stripe** (only for international customers outside Venezuela)

But for the first 1,000 merchants, manual + OCR verification is sufficient and keeps costs at zero.

---

## 6. Updated Removal List

Based on these clarifications, remove from all planning documents:

| Item | Status | Reason |
|---|---|---|
| Stripe | **Removed** | Billing via Pago Movil/Zelle, same as Aurora/Docflow |
| Meta Business Suite (MVP) | **Removed from MVP** | Only needed in Phase 3 for WhatsApp Cloud API |
| ClickHouse | **Removed** | PostgreSQL handles analytics for first 10K+ merchants. Add only when queries exceed 1 second. |
| Grafana/Prometheus | **Removed** | AgentOS handles agent observability. UptimeRobot + Docker logs for the rest. |
| Separate observability stack | **Removed** | AgentOS built-in tracing + basic monitoring is sufficient |

### Updated Cost for 200 Users

| Service | Old Cost | New Cost | Change |
|---|---|---|---|
| Hetzner CX32 | $8.49 | $8.49 | — |
| Backups | $1.70 | $1.70 | — |
| Block Storage | $2.60 | $2.60 | — |
| Clerk | Free | Free | — |
| Resend | Free | Free | — |
| Photoroom | $40 | $40 | — |
| OpenAI (GPT-5 Mini) | $3 | $3 | — |
| Groq | $2 | $2 | — |
| Stripe | $0 | **Removed** | -$0 (was planned for future) |
| ClickHouse | $0 | **Removed** | -$0 (was planned for future) |
| Grafana Cloud | $0 | **Removed** | -$0 (was planned for future) |
| Cloudflare Workers | Free | Free | — |
| Domain | $1.25 | $1.25 | — |
| **Total** | **$59.04** | **$59.04** | No change (removed items were future costs) |

The immediate cost doesn't change because the removed items were all future-phase additions. But the architecture is now simpler and the operational burden is lower.
