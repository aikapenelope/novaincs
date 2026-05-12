# Nova

**Commercial growth SaaS for Venezuelan merchants.** Catalog, payments, CRM, and AI agents — all from the merchant's phone.

Nova turns a smartphone into a sales team. The merchant takes a photo, AI makes it professional, the catalog goes live, customers pay via Pago Móvil or Zelle, and intelligent agents track who buys, who's at risk, and what to do next.

---

## What Nova Is

- A visual catalog with AI image enhancement (background removal, studio lighting)
- A WhatsApp-native checkout with Pago Móvil and Zelle support
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
                                    │
API Gateway:                      Hono (TypeScript, 14kb)
                                    │
Agent Core:                    Agno AgentOS
                    Sales Agent | Content Agent | Finance Agent | Support Agent
                                    │
Services:     Catalog | CRM | Orders | Inventory | Messaging | Image AI | Analytics | Import
                                    │
Data:         PostgreSQL 16 + pgvector | Redis 7 + BullMQ | MinIO | Prefect
```

**Single-user tenancy** — one merchant = one account. Multi-tenant isolation via PostgreSQL Row-Level Security.

**Agent-native** — intelligence is in the center, not bolted on. Agents observe data, detect patterns, suggest or execute actions.

**MCP-native** — Model Context Protocol enables universal connectivity (Google Sheets, Wakit WhatsApp, external bots, bank APIs).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Nuxt 3 + @vite-pwa/nuxt + Shadcn-vue + Tailwind CSS 4 |
| API | Hono 4.x |
| ORM | Drizzle (SQL-first, 7.4kb, zero deps) |
| Auth | Clerk (phone auth + social login) |
| Database | PostgreSQL 16 + pgvector |
| Cache/Queue | Redis 7 + BullMQ |
| Storage | MinIO (S3-compatible) |
| Agents | Agno AgentOS (Python, model-agnostic) |
| LLM | Claude Sonnet 4 (reasoning) + Claude Haiku (fast tasks) |
| Voice | Groq Whisper |
| Images | Photoroom API |
| Workflows | Prefect 3 (scheduled jobs) + BullMQ (real-time jobs) |
| WhatsApp | Cloud API direct (Meta) |
| Integrations | MCP (Model Context Protocol) |
| Email | Resend |
| Proxy | Caddy (auto-SSL) |
| Hosting | Hetzner Cloud (CX32 for first 200 users) |

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
| [07 — Voice Input, Minimal Infra, Prefect](docs/07-VOICE-INPUT-MINIMAL-INFRA-PREFECT-BSP.md) | Voice-to-data input, minimal setup for 200 users ($59/mo), Prefect over Temporal, BSP webhook routing, extensibility assessment |

---

## Infrastructure (First 200 Users)

| Component | Spec | Cost |
|---|---|---|
| Hetzner CX32 | 4 vCPU, 8 GB RAM, 80 GB NVMe | $8.49/mo |
| Backups | Automated | $1.70/mo |
| Block Storage | 50 GB (images) | $2.60/mo |
| External services | Clerk, Resend, Photoroom, Claude, Groq | ~$46/mo |
| **Total** | | **$58.79/mo** |

Revenue at 200 users: ~$1,340/mo. Margin: 95.6%.

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
| Prefect over Temporal | Lightweight, runs on existing PostgreSQL | Temporal requires its own cluster. Prefect self-hosts for free on our DB. |
| Agno over LangGraph | Model-agnostic, MCP native, WhatsApp native | Built-in per-user isolation, fastest framework, production runtime (AgentOS). |
| Resend over SendGrid | Best DX, React Email templates | 3K emails/mo free. $18.80/mo at 25K merchants. |
| Hetzner over AWS | 5x cheaper, 20TB bandwidth included | CX32 at $8.49/mo handles what costs $50+ elsewhere. |
| Feature flags over code forks | One codebase, three products | Merchant upgrades plan → features appear instantly. No separate deployments. |

---

## License

Apache License 2.0 — see [LICENSE](LICENSE).
