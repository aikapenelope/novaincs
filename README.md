# Nova

**Commercial growth SaaS for Venezuelan merchants.** Catalog, payments, CRM, and AI agents — all from the merchant's phone.

Nova turns a smartphone into a sales team. The merchant takes a photo, AI makes it professional, the catalog goes live, customers pay via Pago Movil or Zelle, and intelligent agents track who buys, who's at risk, and what to do next.

---

## What Nova Is

- A visual catalog with AI image enhancement (background removal, studio lighting)
- A WhatsApp-native checkout with Pago Movil and Zelle support
- A behavioral Micro-CRM that scores customers automatically (RFM)
- An AI agent system that suggests actions and can execute them autonomously
- A lightweight ERP (expenses, suppliers, margins, cash flow) for merchants who need it

## What Nova Is Not

- Not a traditional ERP or accounting software
- Not a generic ecommerce platform
- Not a CRM that requires manual data entry
- Not a tool the merchant has to "learn" — it works like Instagram, not like SAP

---

## Architecture

```
Interfaces:  PWA Merchant | PWA Customer | WhatsApp Cloud API | Public REST API | MCP Servers
                                    |
API Gateway:                      Hono (TypeScript, 14kb)
                                    |
Agent Core:                    Agno AgentOS (own PostgreSQL)
                    Sales Agent | Content Agent | Finance Agent | Support Agent
                                    |
Services:     Catalog | CRM | Orders | Inventory | Messaging | Image AI | Analytics | Import
                                    |
Data:         PostgreSQL 16 + pgvector (business) | PostgreSQL (agno) | PostgreSQL (prefect)
              Redis 7 + BullMQ | Cloudflare R2 | Prefect 3
```

**Single-user tenancy** — one merchant = one account. Multi-tenant isolation via PostgreSQL Row-Level Security.

**Agent-native** — intelligence is in the center, not bolted on. Agents observe data, detect patterns, suggest or execute actions. Agno has its own database for memories, sessions, and traces.

**MCP-native** — Model Context Protocol enables universal connectivity (Google Sheets, Wakit WhatsApp, external bots, bank APIs).

**Service isolation** — 8 containers, 3 separate PostgreSQL instances. Each service has its own responsibility. No single failure takes down the system.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Nuxt 3 + @vite-pwa/nuxt + Shadcn-vue + Tailwind CSS 4 |
| API | Hono 4.x |
| ORM | Drizzle (SQL-first, 7.4kb, zero deps) |
| Auth | Clerk (phone auth + social login) |
| Database (business) | PostgreSQL 16 + pgvector |
| Database (agents) | PostgreSQL 16 + pgvector (separate instance) |
| Database (workflows) | PostgreSQL 16 (separate instance) |
| Cache/Queue | Redis 7 + BullMQ |
| Storage | Cloudflare R2 (S3-compatible, free egress) |
| Agents | Agno AgentOS (Python, model-agnostic) |
| LLM | GPT-5 Mini (workhorse) + Groq Llama 4 (fast/cheap) |
| Voice | Groq Whisper |
| Images | Photoroom API |
| Workflows | Prefect 3 (scheduled jobs) + BullMQ (real-time jobs) |
| WhatsApp | Cloud API direct (Meta) |
| Integrations | MCP (Model Context Protocol) |
| Email | Resend |
| Deployment | Dokploy (Traefik for SSL/routing) |
| Hosting | Hetzner Cloud CX43 (8 vCPU, 16 GB RAM) — Helsinki |
| Catalog Edge | Cloudflare Workers (SSR at edge, ~30ms TTFB) |

---

## Product Tiers

| Tier | For | Price | Key Features |
|---|---|---|---|
| **Starter** | Micro-merchants selling via WhatsApp/Instagram | $0-8/mo | Catalog, AI images, checkout, basic inventory, customer list |
| **Pro** | Growing businesses needing organization | $15/mo | Full CRM, financial dashboard, expenses, suppliers, reports, WhatsApp API |
| **Business** | Power users wanting full automation | $25/mo | WhatsApp agent, AI autonomous mode, API access, voice commands |

All tiers run on one codebase. Feature flags control access.

---

## Documentation

| Document | Contents |
|---|---|
| [01 — Strategic Vision](docs/01-STRATEGIC-VISION.md) | Market analysis, competitive landscape, buyer persona, architecture, stack, feature map, business model, defensive moat |
| [02 — CRM & Data Architecture](docs/02-CRM-DATA-ARCHITECTURE.md) | CRM value surfaces, data ingestion (3 streams), migration pipeline, proactive intelligence (5 loops), multi-tenant design, production patterns |
| [03 — Identity, Sizing, Wakit, MCP](docs/03-ADDENDUM-IDENTITY-SIZING-WAKIT-MCP.md) | Customer identity resolution (3 layers), WhatsApp BSUID, database growth projections, Wakit integration, MCP Migration Agent |
| [04 — Checkout, Dashboard, Agents](docs/04-CHECKOUT-DASHBOARD-AGENTS.md) | Checkout flow (5 screens), WhatsApp location, responsive dashboard, inventory-catalog sync, sales tracking, agent data surface (60+ data points) |
| [05 — Reports, Stack, Features, API](docs/05-REPORTS-STACK-FEATURES-API.md) | Report delivery (email via Resend), stack comparison (Hono vs Encore.ts vs NestJS), complete feature registry (89 features), API readiness, webhook events |
| [06 — Roadmap & Infrastructure](docs/06-ROADMAP-INFRASTRUCTURE-GROWTH.md) | Product tiers, WhatsApp BSP architecture, Hetzner deployment, roadmap to 1,000 users (4 phases, 12 months), growth assessment |
| [07 — Voice Input, Infra, Prefect](docs/07-VOICE-INPUT-MINIMAL-INFRA-PREFECT-BSP.md) | Voice-to-data input, Prefect over Temporal, BSP webhook routing, extensibility assessment |
| [08 — Feature Classification & LLM Costs](docs/08-FEATURE-CLASSIFICATION-LLM-COSTS.md) | All 89 features classified (73 deterministic, 13 LLM, 3 external API), model selection (GPT-5 Mini workhorse, Groq for speed), cost per feature, $0.61/merchant/month total AI cost |
| [09 — Catalog Edge & Pre-Dev Checklist](docs/09-CATALOG-EDGE-DEPLOYMENT-PREDEV-CHECKLIST.md) | SvelteKit vs Nuxt 3 analysis (stay Nuxt, deploy to Cloudflare Workers), split deployment, pre-development checklist, 7-day zero-to-code timeline |
| [10 — Corrections: Workers, Billing, Observability](docs/10-CORRECTIONS-WORKERS-BILLING-OBSERVABILITY.md) | Cloudflare Workers architecture, billing via Pago Movil/Zelle (no Stripe), AgentOS built-in observability |
| [11 — Standalone Infrastructure](docs/11-DEFINITIVE-STACK-COOLIFY-DEPLOYMENT.md) | Nova runs on its own VPS, own databases, own deployment. Scaling path to 100K+ merchants |
| [12 — Complete Stack (DEFINITIVE)](docs/12-COMPLETE-STACK-EXPLAINED.md) | Production architecture: 8 containers, 3 PostgreSQL instances, Dokploy deployment, full docker-compose.yml, memory budget, failure scenarios, $71.39/mo total |

---

## Infrastructure (First 200 Users)

| Component | Spec | Cost |
|---|---|---|
| Hetzner CX43 | 8 vCPU, 16 GB RAM, 160 GB NVMe (Helsinki) | ~€16/mo |
| Backups | Automated | ~€3/mo |
| Cloudflare | Workers + R2 + DNS | $0 (free tier) |
| External services | Clerk, Resend, Photoroom, OpenAI, Groq | ~$46/mo |
| **Total** | | **~€65/mo** |

Revenue at 200 users: ~$1,340/mo. Margin: 94.7%.

8 containers: nova-api, nova-dashboard, nova-agents, prefect, pg-nova, pg-agno, pg-prefect, redis. Each service isolated. No single failure takes down the system.

---

## Roadmap

```
Month 1       Foundation (scaffolding, auth, multi-tenant, CI/CD)
Month 2-3     MVP (catalog, images, checkout, payments, inventory)
Month 4-6     Intelligence (CRM, RFM, agents, reports, imports)
Month 7-9     Automation (WhatsApp API, broadcasts, expenses, tiers)
Month 10-12   Platform (Wakit, public API, MCP, analytics, voice)
```

---

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Single-user tenancy | One merchant = one account | Simplifies auth, permissions, and agent isolation. Multi-user can be added later. |
| Hono over NestJS | Minimal overhead, multi-runtime | Small team needs speed, not ceremony. 14kb vs 14MB. |
| Drizzle over Prisma | SQL-first, no generation step | 7.4kb, zero deps, instant cold starts, full SQL control. |
| Prefect over Temporal | Lightweight, own PostgreSQL | Temporal requires its own cluster. Prefect self-hosts with dedicated DB. |
| Agno over LangGraph | Model-agnostic, MCP native, own DB | Built-in per-user isolation, fastest framework, production runtime (AgentOS). |
| Dokploy over Coolify | 350MB RAM vs 700MB idle | Same features (git deploy, Traefik, dashboard). Half the resource overhead. |
| Cloudflare R2 over MinIO | No container needed, free egress | Saves ~512MB RAM. $0.015/GB/mo. S3-compatible API. |
| 3 separate PostgreSQL | Business, agents, workflows | Each service owns its data. No cross-contamination. Independent backups. |
| CX43 over CX32 | 16 GB RAM for proper isolation | 8 containers need headroom. $8 more buys robustness. |
| Hetzner over AWS | 5x cheaper, 20TB bandwidth | CX43 at $16.49/mo handles what costs $80+ elsewhere. |
| Feature flags over code forks | One codebase, three products | Merchant upgrades plan -> features appear instantly. No separate deployments. |

---

## License

Apache License 2.0 — see [LICENSE](LICENSE).
