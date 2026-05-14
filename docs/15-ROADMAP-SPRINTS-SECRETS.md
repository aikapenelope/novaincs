# Nova — Sprint Roadmap & Secrets Management

> **Status**: Active  
> **Last Updated**: May 2026  
> **Scope**: Complete sprint-by-sprint roadmap from current state to platform launch, and secrets management strategy using Pulumi ESC.

---

## 1. Current State (Sprint 1 Complete)

| Component | Status |
|---|---|
| Hetzner CX43 (8 vCPU, 16 GB, Helsinki) | Running |
| Pulumi IaC (firewall, SSH, network) | Clean, PR pending |
| Dokploy + Traefik (SSL/routing) | Running |
| pg-nova (PostgreSQL 16 + pgvector 0.8.2) | Healthy |
| pg-agno (PostgreSQL 16 + pgvector 0.6.2) | Healthy |
| pg-prefect (PostgreSQL 16) | Healthy |
| Redis 7 (cache + BullMQ + Prefect messaging) | Healthy |
| Prefect 3 (workflow engine) | Running |
| Read-only user (nova_readonly) | Created |
| Automated backups (pg_dump cron) | Configured |
| 14 planning documents | Complete |

**Memory**: 2.1 GB used / 15 GB total (86% free)  
**Disk**: 9.8 GB used / 150 GB total (93% free)

---

## 2. Secrets Management: Pulumi ESC

### Why Pulumi ESC (Not Dokploy Env Vars)

| Criterion | Dokploy Env Vars | Pulumi ESC |
|---|---|---|
| Centralized | No (per-service) | Yes (one environment) |
| Versioned | No | Yes (full history) |
| Audited | No | Yes (who changed what, when) |
| Programmatic access | No | Yes (`pulumi env run`) |
| CI/CD integration | Manual | Automatic |
| Rotation | Manual | Supported |
| Encryption at rest | Depends on Dokploy | Yes (Pulumi Cloud) |

### Environment Structure

Nova uses two ESC environments:

```
aikapenelope-org/
├── qyne-infra/secrets          # Infrastructure secrets (Hetzner token) — already exists
└── qyne-infra/nova-app         # Application secrets (API keys, DB passwords) — to create
```

### `qyne-infra/nova-app` Environment Definition

```yaml
# Application secrets for Nova containers
# Used by: docker-compose on the server, CI/CD pipeline, local dev

values:
  # === PostgreSQL ===
  pgNovaPassword:
    fn::secret: <generate-with-openssl-rand>
  pgNovaRoPassword:
    fn::secret: <generate-with-openssl-rand>
  pgAgnoPassword:
    fn::secret: <generate-with-openssl-rand>
  pgPrefectPassword:
    fn::secret: <generate-with-openssl-rand>

  # === Redis ===
  redisPassword:
    fn::secret: <generate-with-openssl-rand>

  # === Auth ===
  clerkSecretKey:
    fn::secret: <from-clerk-dashboard>

  # === AI / LLM ===
  openaiApiKey:
    fn::secret: <from-openai-platform>
  groqApiKey:
    fn::secret: <from-groq-console>

  # === External Services ===
  photoroomApiKey:
    fn::secret: <from-photoroom-dashboard>
  resendApiKey:
    fn::secret: <from-resend-dashboard>

  # === Cloudflare R2 ===
  r2AccessKeyId:
    fn::secret: <from-cloudflare-dashboard>
  r2SecretAccessKey:
    fn::secret: <from-cloudflare-dashboard>
  r2Bucket: nova-images
  r2Endpoint: https://<account-id>.r2.cloudflarestorage.com

  # === Environment Variables (for containers) ===
  environmentVariables:
    PG_NOVA_PASSWORD: ${pgNovaPassword}
    PG_NOVA_RO_PASSWORD: ${pgNovaRoPassword}
    PG_AGNO_PASSWORD: ${pgAgnoPassword}
    PG_PREFECT_PASSWORD: ${pgPrefectPassword}
    REDIS_PASSWORD: ${redisPassword}
    CLERK_SECRET_KEY: ${clerkSecretKey}
    OPENAI_API_KEY: ${openaiApiKey}
    GROQ_API_KEY: ${groqApiKey}
    PHOTOROOM_API_KEY: ${photoroomApiKey}
    RESEND_API_KEY: ${resendApiKey}
    R2_ACCESS_KEY_ID: ${r2AccessKeyId}
    R2_SECRET_ACCESS_KEY: ${r2SecretAccessKey}
    R2_BUCKET: ${r2Bucket}
    R2_ENDPOINT: ${r2Endpoint}
```

### How Secrets Reach the Containers

**Option A: Generate `.env` on the server (recommended for now)**

```bash
# In the CI/CD deploy step or manually:
pulumi env run aikapenelope-org/qyne-infra/nova-app -- bash -c '
  cat > /opt/nova/.env << EOF
PG_NOVA_PASSWORD=$PG_NOVA_PASSWORD
PG_NOVA_RO_PASSWORD=$PG_NOVA_RO_PASSWORD
PG_AGNO_PASSWORD=$PG_AGNO_PASSWORD
PG_PREFECT_PASSWORD=$PG_PREFECT_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
CLERK_SECRET_KEY=$CLERK_SECRET_KEY
OPENAI_API_KEY=$OPENAI_API_KEY
GROQ_API_KEY=$GROQ_API_KEY
PHOTOROOM_API_KEY=$PHOTOROOM_API_KEY
RESEND_API_KEY=$RESEND_API_KEY
R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY
R2_BUCKET=$R2_BUCKET
R2_ENDPOINT=$R2_ENDPOINT
EOF
  chmod 600 /opt/nova/.env
'
```

**Option B: Dokploy reads from ESC (future)**

When Dokploy supports external secret providers, configure it to pull from ESC directly. Until then, Option A works.

### Setup Commands

```bash
# Create the environment
pulumi env init aikapenelope-org/qyne-infra/nova-app

# Set each secret (example)
pulumi env set aikapenelope-org/qyne-infra/nova-app pgNovaPassword "$(openssl rand -base64 32)" --secret
pulumi env set aikapenelope-org/qyne-infra/nova-app redisPassword "$(openssl rand -base64 32)" --secret
# ... repeat for each secret

# Verify (secrets hidden)
pulumi env get aikapenelope-org/qyne-infra/nova-app

# Test: run a command with secrets loaded
pulumi env run aikapenelope-org/qyne-infra/nova-app -- env | grep PG_NOVA
```

---

## 3. Sprint Roadmap

### Phase 0: Foundation (Sprints 2-5, Weeks 1-8)

**Goal**: Monorepo, schema, auth, CI/CD, first production deploy. A merchant can create an account, add products, and see a public catalog.

#### Sprint 2 (Weeks 1-2): Founder Decisions + Monorepo Scaffolding

| # | Task | Blocks |
|---|---|---|
| 1 | Founder decisions: product name, domain, free tier limits, language, BCV rate source | Everything |
| 2 | External accounts: Clerk, Cloudflare, Resend, OpenAI, Groq, Photoroom | Auth, images, email |
| 3 | Create Pulumi ESC environment `qyne-infra/nova-app` with all secrets | Container deployment |
| 4 | Monorepo scaffolding: pnpm workspace + turborepo | All code |
| 5 | App scaffolding: `apps/api` (Hono), `apps/dashboard` (Nuxt 3), `apps/catalog` (Nuxt 3 CF Workers) | All code |
| 6 | Packages: `packages/shared` (types), `packages/ui` (Shadcn-vue components) | Code sharing |
| 7 | ESLint + Prettier + Vitest configuration | Code quality |
| 8 | Docker Compose for local dev (mirrors production) | Local development |

**Exit**: `pnpm dev` starts all 3 apps + local databases. Lint and typecheck pass.

#### Sprint 3 (Weeks 3-4): Database Schema + Auth

| # | Task | Blocks |
|---|---|---|
| 1 | Drizzle schema: all MVP tables with indexes and constraints | All backend |
| 2 | Row-Level Security policies on all tenant-scoped tables | Multi-tenant isolation |
| 3 | Drizzle migrations system | Schema deployment |
| 4 | Clerk auth middleware in Hono (JWT verify, tenant lookup, RLS context) | All API endpoints |
| 5 | RLS security tests (tenant A cannot see tenant B data) | Trust in isolation |
| 6 | Tenant CRUD: create on signup, get current tenant | Onboarding |

**Exit**: User registers via Clerk, tenant is created, queries are isolated by RLS. Security tests pass.

#### Sprint 4 (Weeks 5-6): API Core + Basic Catalog

| # | Task | Blocks |
|---|---|---|
| 1 | Product CRUD API with Zod validation | Catalog |
| 2 | Category CRUD API | Product organization |
| 3 | Image upload to Cloudflare R2 (signed URLs, 5MB limit, type validation) | Product photos |
| 4 | Catalog PWA: product listing, product detail, category navigation (Nuxt 3 SSR) | Buyers see products |
| 5 | Dashboard PWA: product grid, create/edit product, image upload (Nuxt 3) | Merchant manages products |
| 6 | API contract documentation (OpenAPI) | Frontend-backend parallel work |

**Exit**: Merchant adds products with photos. Buyer sees public catalog at a shareable URL.

#### Sprint 5 (Weeks 7-8): CI/CD + First Production Deploy

| # | Task | Blocks |
|---|---|---|
| 1 | Dockerfiles for nova-api and nova-dashboard (multi-stage builds) | Deploy |
| 2 | GitHub Actions CI: lint, typecheck, test on PR | Automated quality |
| 3 | Deploy pipeline to Hetzner (build, push, restart containers) | Production |
| 4 | Catalog deploy to Cloudflare Workers | Edge catalog |
| 5 | Update production docker-compose with app containers | Full production stack |
| 6 | Smoke test on production server | End-to-end validation |

**Exit**: Merge to main auto-deploys. 7+ containers running in production. Catalog serves from Cloudflare Workers.

---

### Phase 1: MVP (Sprints 6-9, Weeks 9-16)

**Goal**: A merchant can sell products and get paid. End-to-end: add product with AI photo, share catalog, receive order, verify payment.

#### Sprint 6 (Weeks 9-10): AI Images + Inventory

- Photoroom API integration (background removal, staging)
- BullMQ worker for async image processing
- Inventory management (stock per product/variant, +/- adjustment, movement history)
- Low stock alerts (push notification)
- Product variants (size, color, presentation)
- Dual pricing (USD + Bs with BCV rate auto-conversion)

**Exit**: Merchant takes photo, AI enhances it in 3 seconds, product appears in catalog with dual price and stock.

#### Sprint 7 (Weeks 11-12): Complete Checkout

- Shopping cart (localStorage + API, sticky bottom bar)
- Buyer info form (2 required fields: name + phone)
- Pago Movil flow (copy bank data, upload screenshot)
- Zelle flow (show email, reference field)
- Cash on delivery option
- Payment screenshot upload to R2
- Stock reservation on checkout (24h TTL)

**Exit**: Buyer fills cart, chooses payment method, uploads screenshot. Merchant receives the order.

#### Sprint 8 (Weeks 13-14): Orders + WhatsApp Deep Links

- Order management (list with filters, detail view, status updates)
- Mark as paid (inventory auto-adjusts)
- Mark as shipped/delivered
- WhatsApp deep link checkout (`wa.me/...?text=...` with structured order)
- Unique payment links per order
- Returning customer auto-fill (cookie)
- Daily sales total on home screen

**Exit**: Complete end-to-end flow works. Merchant shares link, buyer pays, merchant confirms, inventory adjusts.

#### Sprint 9 (Weeks 15-16): Onboarding + Import + Polish

- Onboarding wizard (create store, configure payments, add first product)
- Payment method configuration (Pago Movil/Zelle bank details)
- Excel/CSV import (SheetJS parsing, validation, preview, import)
- Catalog SEO (meta tags, Open Graph, JSON-LD)
- Product search (PostgreSQL full-text with tsvector)
- Browser geolocation for delivery
- Bug fixes and polish with 2-3 real merchants

**Exit**: **BETA LAUNCH**. Invite 10-20 real merchants. Complete flow works without technical intervention.

---

### Phase 2: Intelligence (Sprints 10-15, Weeks 17-28)

**Goal**: The system knows the merchant's customers and helps them sell more. Behavioral CRM, RFM scoring, AI agents, reports.

#### Sprint 10 (Weeks 17-18): Basic CRM + Behavioral Tracking

- Customer auto-profiles from orders
- Customer list with search
- Customer detail card (name, phone, orders, lifetime value)
- Behavioral event tracking (beacon API in catalog PWA, Redis Streams -> BullMQ -> PostgreSQL)
- Manual notes and custom tags on customers

#### Sprint 11 (Weeks 19-20): RFM Scoring + Segments

- RFM scoring engine (BullMQ cron, per-merchant calibrated thresholds)
- Auto-segments: VIP, Loyal, At Risk, Hibernating, Window Shopper, New, One-Timer
- Customer timeline (chronological interaction history)
- Cart abandonment detection (2h timer)
- Identity merge (anonymous visitor -> identified customer)

#### Sprint 12 (Weeks 21-22): Agno Agents — Finance Agent

- Deploy nova-agents container (Agno AgentOS) to production
- Finance Agent: OCR payment screenshots (GPT-5 Mini vision)
- Daily briefing: AI-generated morning summary
- Accounts receivable tracking with aging
- Exchange rate integration (BCV API every 15 min)

#### Sprint 13 (Weeks 23-24): Smart Feed + Notifications

- Smart feed with action cards ("Maria hasn't bought in 15 days")
- Web Push notifications (new order, payment verified, low stock)
- In-app notification center
- Revenue attribution map per customer

#### Sprint 14 (Weeks 25-26): Google Sheets Import + Financial Dashboard

- Google Sheets import via MCP Migration Agent
- Financial dashboard (daily/weekly/monthly income, margin per product, top products/customers)
- Mass price update when exchange rate changes
- PDF/Excel export of sales data

#### Sprint 15 (Weeks 27-28): Email Reports + Plan Tiers

- Email reports via Resend (weekly summary, monthly PDF report)
- Feature flags system (Starter/Pro/Business)
- Subscription billing via Pago Movil/Zelle (same flow as customer payments)
- Plan management UI

**Exit**: **PAID LAUNCH**. 3 active plans. Merchants pay for Nova. 50-100 merchants.

---

### Phase 3: Automation (Sprints 16-21, Weeks 29-40)

**Goal**: The system acts on behalf of the merchant. WhatsApp API, proactive agents, ERP-lite.

#### Sprints 16-17 (Weeks 29-32): WhatsApp Business API

- WhatsApp Cloud API integration (webhook endpoint, WABA routing)
- Embedded Signup (one-click WhatsApp connection)
- Broadcast messages by CRM segment
- Automated welcome message on first order
- Abandoned cart recovery message

#### Sprints 18-19 (Weeks 33-36): Sales + Content + Support Agents

- Sales Agent (detect opportunities, suggest actions with pre-drafted messages)
- Content Agent (product descriptions, social media copy)
- Post-sale follow-up messages
- Support Agent (Q&A about merchant's own data)

#### Sprints 20-21 (Weeks 37-40): ERP-Lite + Custom Fields

- Expense tracking (manual entry with categories, P&L)
- Supplier management (CRUD: name, contact, products supplied)
- Custom fields on products and customers (JSONB)
- Complete financial dashboard (cash flow, 7/30-day projection, period comparison)

**Exit**: 3 plan tiers generating revenue. Pro merchants see measurable value from AI agents. 500-1,000 merchants.

---

### Phase 4: Platform (Sprints 22-27, Weeks 41-52)

**Goal**: Nova becomes an extensible platform.

#### Sprints 22-23 (Weeks 41-44): Wakit + WhatsApp Bot

- Wakit MCP integration (full conversation access)
- WhatsApp inbox tab in dashboard
- AI WhatsApp agent (answers questions, takes orders, processes payments)

#### Sprints 24-25 (Weeks 45-48): Public API + Webhooks

- Public REST API (documented, versioned, rate-limited by plan)
- Webhook subscriptions (order.created, payment.verified, etc.)
- MCP Server for external agent access

#### Sprints 26-27 (Weeks 49-52): Analytics + Voice + Multi-Country

- Meta Pixel + Conversions API integration
- Voice commands (Groq Whisper + GPT-5 Mini parsing)
- AI autonomous mode (agents act without approval)
- Multi-country preparation (i18n, Colombia as second market)

**Exit**: **1,000+ merchants**. 3 tiers generating revenue. Platform extensible via API. Ready for regional expansion.

---

## 4. Summary Timeline

```
DONE     ██ Sprint 1: Infrastructure base (DBs, Redis, Prefect, backups)

PHASE 0  ██ Sprint 2:  Decisions + Monorepo scaffolding
         ██ Sprint 3:  Drizzle schema + Clerk auth + RLS
         ██ Sprint 4:  API core + Basic catalog
         ██ Sprint 5:  CI/CD + First production deploy
                       → Merchant creates account, adds products, public catalog

PHASE 1  ██ Sprint 6:  AI images (Photoroom) + Inventory
         ██ Sprint 7:  Complete checkout (Pago Movil, Zelle, screenshot)
         ██ Sprint 8:  Orders + WhatsApp deep links
         ██ Sprint 9:  Onboarding + Excel import + Polish
                       → BETA LAUNCH (10-20 merchants)

PHASE 2  ██ Sprint 10: Basic CRM + Behavioral tracking
         ██ Sprint 11: RFM scoring + Auto-segments
         ██ Sprint 12: Agno agents (Finance Agent, OCR, briefing)
         ██ Sprint 13: Smart feed + Notifications
         ██ Sprint 14: Google Sheets import + Financial dashboard
         ██ Sprint 15: Email reports + Plan tiers + Billing
                       → PAID LAUNCH (50-100 merchants, 3 plans)

PHASE 3  ██ Sprint 16-17: WhatsApp Business API + Broadcasts
         ██ Sprint 18-19: Sales + Content + Support Agents
         ██ Sprint 20-21: ERP-lite (expenses, suppliers, custom fields)
                       → GROWTH (500-1,000 merchants)

PHASE 4  ██ Sprint 22-23: Wakit + WhatsApp bot
         ██ Sprint 24-25: Public API + Webhooks + MCP Server
         ██ Sprint 26-27: Meta Pixel + Voice + Multi-country
                       → PLATFORM (1,000+ merchants)
```

---

## 5. Critical Dependencies

| Decision | Blocks | Who |
|---|---|---|
| Product name | Domain, Clerk, branding | Founder |
| Domain | SSL, catalog URLs, email, Clerk config | Founder |
| Clerk account | Auth (Sprint 3) | Technical (needs domain) |
| Cloudflare account | Catalog edge (Sprint 5) | Technical (needs domain) |
| Photoroom account | AI images (Sprint 6) | Technical |
| Brand identity (logo, colors) | All UI work | Designer/Founder |

**The next immediate step is Sprint 2**: founder decisions + monorepo scaffolding. Without a domain and external accounts, development cannot proceed beyond scaffolding.
