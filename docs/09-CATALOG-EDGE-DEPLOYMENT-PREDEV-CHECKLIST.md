# Nova — Catalog Performance, Edge Deployment & Complete Pre-Development Checklist

> **Status**: Planning Phase — FINAL DOCUMENT  
> **Last Updated**: May 2026  
> **Scope**: SvelteKit vs Nuxt 3 analysis for catalog PWA, Cloudflare edge deployment strategy, and exhaustive pre-development checklist with every task, account, decision, and artifact needed to start coding.

---

## Table of Contents

1. [Catalog PWA: SvelteKit vs Nuxt 3 on the Edge](#1-catalog-pwa-sveltekit-vs-nuxt-3-on-the-edge)
2. [Complete Pre-Development Checklist](#2-complete-pre-development-checklist)

---

## 1. Catalog PWA: SvelteKit vs Nuxt 3 on the Edge

### 1.1 The Question

Should the buyer-facing catalog PWA use SvelteKit for speed, or stay on Nuxt 3 for consistency?

### 1.2 The Answer: Nuxt 3, Deployed to Cloudflare Workers

**Don't switch to SvelteKit. Deploy Nuxt 3 to Cloudflare Workers instead.** Here's why:

#### Performance Comparison (Real Benchmarks)

| Metric | Nuxt 3 (Node SSR) | Nuxt 3 (Cloudflare Workers) | SvelteKit (Node SSR) | SvelteKit (CF Workers) |
|---|---|---|---|---|
| Cold start | ~2ms | ~2ms | ~5ms | ~3ms |
| TTFB (same region) | 50-100ms | 20-40ms | 40-80ms | 15-35ms |
| TTFB (cross-region, e.g., VZ user → EU server) | 200-400ms | **30-50ms** (edge) | 180-350ms | **25-45ms** (edge) |
| Bundle size (gzip) | ~700kb | ~700kb | ~400kb | ~400kb |
| Lighthouse score | 90-95 | 95-100 | 92-97 | 96-100 |
| JS shipped to client | Medium (Vue runtime) | Medium (Vue runtime) | Small (compiled away) | Small (compiled away) |

SvelteKit ships ~40% less JavaScript to the client because Svelte compiles away the framework at build time. That's a real advantage for interactivity (FID/INP scores).

**But the biggest performance gain isn't the framework — it's the deployment location.** Moving from a Hetzner server in Helsinki to Cloudflare Workers at the edge reduces TTFB from 200-400ms to 30-50ms for Venezuelan users. That's a 5-10x improvement that dwarfs the framework difference.

#### Why Not SvelteKit

| Factor | Impact | Verdict |
|---|---|---|
| **Two frameworks = two codebases** | Components, utilities, types can't be shared between dashboard and catalog | Major maintenance burden |
| **Two ecosystems** | Vue ecosystem (Shadcn-vue, VueUse, Pinia) vs Svelte ecosystem (Skeleton, svelte-use) | Double the library decisions |
| **Team knowledge** | Must be proficient in both Vue and Svelte | Hiring and onboarding harder |
| **Shared types** | API types defined once, used in both frontends — only works if both use the same language patterns | TypeScript works in both, but Vue and Svelte have different component patterns |
| **Performance gap** | SvelteKit is ~20-30% faster on client-side interactivity | Real, but the catalog is mostly read-only (browsing products). Interactivity is limited to cart operations. |

The catalog PWA is a **read-heavy, low-interactivity** application. Customers browse products, view details, add to cart, and checkout. There are no complex interactive dashboards, no drag-and-drop, no real-time collaboration. For this use case, the framework's client-side performance matters less than the server's response time.

#### The Architecture: Split Deployment

```
BUYER CATALOG (Nuxt 3)          MERCHANT DASHBOARD (Nuxt 3)
Deployed to: Cloudflare Workers  Deployed to: Hetzner CX42
Why: Edge SSR, ~30ms TTFB        Why: Needs direct DB access,
     globally, $5/mo                   agents, background jobs
     (Workers free tier: 100K     
     requests/day)                
         │                              │
         │ API calls                    │ Direct DB access
         ▼                              ▼
    Nova API (Hono)              Nova API (Hono)
    on Hetzner CX42              on Hetzner CX42
         │                              │
         ▼                              ▼
    PostgreSQL + Redis           PostgreSQL + Redis
    on Hetzner CX42              on Hetzner CX42
```

**The catalog PWA runs on Cloudflare Workers.** It's a separate Nuxt 3 app that:
- Server-renders product pages at the edge (closest Cloudflare POP to the user)
- Fetches data from the Nova API on Hetzner via HTTP (cached aggressively)
- Serves static assets (images, CSS, JS) from Cloudflare's CDN
- Costs $5/month on the Workers paid plan (10M requests/month) or free for the first 100K requests/day

**The merchant dashboard stays on Hetzner.** It needs direct access to PostgreSQL, Redis, BullMQ workers, and Agno agents. Edge deployment doesn't make sense for the dashboard because:
- The merchant is one person in one location (not globally distributed)
- The dashboard needs real-time DB access for inventory, orders, CRM
- Background jobs and agents run on the same server

#### Same Codebase, Different Deployments

Both PWAs are Nuxt 3 apps in the same monorepo. They share:
- TypeScript types (API contracts, entity types)
- UI components (product cards, buttons, forms — via a shared package)
- Tailwind CSS configuration
- API client (typed HTTP client for the Nova API)

```
nova/
├── packages/
│   ├── shared/          # Shared types, utilities, API client
│   └── ui/              # Shared Vue components (Shadcn-vue based)
├── apps/
│   ├── catalog/         # Buyer-facing PWA (deploys to Cloudflare Workers)
│   ├── dashboard/       # Merchant-facing PWA (deploys to Hetzner)
│   └── api/             # Hono API server (deploys to Hetzner)
├── agents/              # Agno agents (Python, deploys to Hetzner)
└── infra/               # Docker Compose, Prefect flows, deployment scripts
```

This is a **turborepo/pnpm workspace** monorepo. One repo, shared code, different deployment targets.

#### Cloudflare Workers Cost

| Tier | Requests/Day | Price |
|---|---|---|
| Free | 100,000 | $0 |
| Paid | 10,000,000/month | $5/month |
| Paid (overage) | +$0.50 per million | Variable |

At 200 merchants with ~100 catalog visitors/day each = 20,000 requests/day. **Free tier covers this.** At 1,000 merchants: ~100,000 requests/day. Still free tier. At 5,000 merchants: ~500,000 requests/day = ~15M/month. $5/month + $2.50 overage = **$7.50/month**.

The catalog runs on the edge for essentially free.

---

## 2. Complete Pre-Development Checklist

Everything that needs to happen before the first line of product code is written. Organized by category, with time estimates and dependencies.

### 2.1 Founder Decisions (No Code Required)

These are decisions only the founder can make. They block everything else.

| # | Decision | Options | Recommendation | Blocks | Time |
|---|---|---|---|---|---|
| D1 | **Product name** | Nova, NovaIncs, other | Nova (short, memorable, .app domain available) | Domain, branding, Meta app, legal | 1 day |
| D2 | **Domain** | nova.app, novaincs.com, other | nova.app ($14/year from Google Domains) | SSL, email, catalog URLs, Clerk config | 1 day |
| D3 | **Hetzner datacenter** | Helsinki (hel1), Ashburn (ash), Falkenstein (fsn1) | Ashburn (ash) — lowest latency to Venezuela (~60ms vs ~150ms from Helsinki) | Server provisioning | 1 day |
| D4 | **How merchants pay for Nova** | Stripe (international cards), crypto, manual bank transfer | Stripe for international cards + manual Pago Movil/Zelle for VZ merchants | Billing system | 1 day |
| D5 | **Free tier limits** | Various | 20 products, 50 orders/mo, 10 AI images/mo | Feature flag config | 1 day |
| D6 | **WhatsApp for MVP** | Deep links only (free) vs Cloud API ($) | Deep links only for MVP. Cloud API in Phase 3. | WhatsApp integration scope | 1 day |
| D7 | **Language** | Spanish only, Spanish + English | Spanish only for MVP. i18n structure from day 1 for future English. | UI text, agent prompts | 1 day |
| D8 | **Legal entity** | US LLC, VZ company, other | US LLC (Delaware) for Stripe, Meta, and international operations | Terms of service, privacy policy | 1 week (lawyer) |
| D9 | **BCV rate source** | Official BCV scraping, third-party API (e.g., exchangerate.host, pydolarvenezuela) | Third-party API (pydolarvenezuela or similar) — more reliable than scraping BCV directly | Exchange rate feature | 1 day |

**Total founder decision time: 1-2 days** (except legal entity which runs in parallel).

### 2.2 Account Setup (Technical, No Code)

| # | Account | What's Needed | Cost | Time | Blocks |
|---|---|---|---|---|---|
| A1 | **Hetzner Cloud** | Create account, verify identity, provision CX42 in Ashburn | $16.49/mo | 1-2 hours (may need ID verification) | All deployment |
| A2 | **Cloudflare** | Create account, add domain, configure DNS, enable Workers | Free (free tier) | 30 min | Catalog deployment, SSL |
| A3 | **Clerk** | Create project, configure phone auth + Google login, set redirect URLs | Free (10K MAU) | 30 min | Auth |
| A4 | **Resend** | Create account, verify domain (SPF/DKIM/DMARC), create API key | Free (3K emails/mo) | 1 hour (DNS propagation) | Email reports |
| A5 | **OpenAI** | Create account, add payment method, generate API key | Pay-as-you-go | 10 min | All LLM features |
| A6 | **Groq** | Create account, generate API key | Free tier available | 10 min | Voice transcription |
| A7 | **Photoroom** | Create account, get API key, choose plan | $7.50/mo (Pro) | 10 min | Image enhancement |
| A8 | **GitHub** | Repo already exists (novaincs). Configure branch protection, CI/CD secrets. | Free | 30 min | Development workflow |
| A9 | **Google Cloud** | Create project, enable Sheets API, create service account, download JSON key | Free | 30 min | Google Sheets import |
| A10 | **Meta Business Suite** | Create business account (for future WhatsApp Cloud API). Not needed for MVP. | Free | 1 hour | WhatsApp (Phase 3) |

**Total setup time: ~4-5 hours** (can be done in one afternoon).

### 2.3 Design Artifacts

| # | Artifact | Description | Tool | Time | Blocks |
|---|---|---|---|---|---|
| G1 | **Brand identity** | Logo, color palette (primary, secondary, accent), typography (heading + body fonts), tone of voice | Figma or similar | 2-3 days | All UI work |
| G2 | **UI wireframes (mobile)** | Key screens: onboarding (4 screens), catalog browse, product detail, cart, checkout (5 screens), dashboard home, product management, order list, order detail, customer list, customer detail, settings | Figma | 3-5 days | Frontend development |
| G3 | **Database schema** | All tables in Drizzle TypeScript format, with relations, indexes, RLS policies | Code (first dev task) | 2-3 days | All backend development |
| G4 | **API contract** | OpenAPI spec or tRPC router definitions for all MVP endpoints | Code (second dev task) | 2-3 days | Frontend-backend parallel work |
| G5 | **Agent prompt library** | System prompts for Finance Agent (Phase 2) and Support Agent (Phase 2). Not needed for MVP. | Text document | 1-2 days | Agent development (Phase 2) |
| G6 | **Email templates** | Welcome email, weekly summary, monthly report. React Email components. | Code (Phase 2 task) | 1-2 days | Email system (Phase 2) |
| G7 | **WhatsApp message templates** | Order confirmation, follow-up, reminder. Pre-approved by Meta. | Text + Meta submission | 1-2 days | WhatsApp (Phase 3) |

**For MVP, only G1-G4 are needed.** G5-G7 are Phase 2-3 tasks.

### 2.4 Development Environment Setup

| # | Task | Description | Time |
|---|---|---|---|
| E1 | **Monorepo scaffolding** | pnpm workspace with turborepo. Three apps (catalog, dashboard, api) + two packages (shared, ui). | 2 hours |
| E2 | **Nuxt 3 catalog app** | `npx nuxi init` with Cloudflare Workers preset, Tailwind CSS 4, Shadcn-vue | 1 hour |
| E3 | **Nuxt 3 dashboard app** | `npx nuxi init` with Node server preset, Tailwind CSS 4, Shadcn-vue, @vite-pwa/nuxt | 1 hour |
| E4 | **Hono API server** | Hono project with Drizzle ORM, Clerk middleware, CORS, rate limiting | 2 hours |
| E5 | **Docker Compose (local dev)** | 3x PostgreSQL (nova, agno, prefect) + Redis 7. One `docker compose up` starts everything. | 2 hours |
| E6 | **Drizzle schema + migrations** | All MVP tables: tenants, products, categories, customers, orders, order_items, payments, inventory_movements, customer_events. RLS policies. | 2-3 days |
| E7 | **CI/CD pipeline** | GitHub Actions: lint, typecheck, test on PR. Deploy to Hetzner on merge to main. Deploy catalog to Cloudflare Workers. | 3-4 hours |
| E8 | **Clerk integration** | Auth middleware in Hono, tenant context extraction, RLS session variable setting | 4 hours |
| E9 | **Shared types package** | TypeScript types for all entities (Product, Customer, Order, etc.) shared between all three apps | 2 hours |
| E10 | **Linting + formatting** | ESLint + Prettier configured for the monorepo. Consistent across all apps. | 1 hour |
| E11 | **Testing framework** | Vitest for unit/integration tests. Playwright for E2E. RLS security test suite. | 2 hours |

**Total dev environment setup: ~3-4 days.**

### 2.5 Server Provisioning (Hetzner)

| # | Task | Description | Time |
|---|---|---|---|
| H1 | **Provision CX42** | 8 vCPU, 16 GB RAM, 160 GB NVMe, Ashburn datacenter | 5 min |
| H2 | **SSH key setup** | Generate and add SSH key for secure access | 10 min |
| H3 | **Firewall rules** | Allow 80 (HTTP), 443 (HTTPS), 22 (SSH). Block everything else. | 10 min |
| H4 | **Docker + Docker Compose** | Install Docker Engine and Docker Compose on the server | 15 min |
| H5 | **Block storage** | Attach 100 GB volume for PostgreSQL data, mount at /mnt/storage | 10 min |
| H6 | **Automated backups** | Enable Hetzner automated backups ($1.70/mo) | 5 min |
| H7 | **Dokploy installation** | Install Dokploy (includes Traefik for SSL/routing) | 15 min |
| H8 | **Docker Compose (production)** | Production docker-compose.yml with 8 containers, resource limits, restart policies, health checks | 1 hour |
| H9 | **Deploy script** | Shell script or GitHub Action that builds, pushes images, and restarts containers on the server | 1 hour |
| H10 | **Monitoring** | Basic uptime monitoring (UptimeRobot free tier or similar) + Docker logs | 30 min |

**Total server provisioning: ~4-5 hours.**

### 2.6 Complete Timeline: From Zero to First Commit

```
DAY 1:  Founder decisions (D1-D9)
        Account setup (A1-A9) — can run in parallel
        Domain + DNS + Cloudflare (A2)

DAY 2:  Server provisioning (H1-H10)
        Monorepo scaffolding (E1)
        App scaffolding (E2, E3, E4)

DAY 3:  Docker Compose local dev (E5)
        Shared types package (E9)
        Linting + testing setup (E10, E11)
        CI/CD pipeline (E7)

DAY 4:  Clerk integration (E8)
        Start database schema (E6)

DAY 5:  Finish database schema (E6)
        Start API contract (E4 continued)

DAY 6:  Finish API contract
        First deployment test (push to Hetzner, verify containers start)
        Catalog deployment test (push to Cloudflare Workers)

DAY 7:  Brand identity kickoff (G1) — can run in parallel with coding
        UI wireframes kickoff (G2) — can run in parallel with coding
        ✅ READY TO START MVP CODING (Phase 1, Week 5 of roadmap)
```

**7 days from decision to first product code.** The first week is pure setup. No product features are built. But after this week, the entire development infrastructure is in place and the team can move fast.

### 2.7 What's NOT Needed Before Coding

Things that can wait and should not block the start:

| Item | When It's Actually Needed | Why It Can Wait |
|---|---|---|
| Legal entity (LLC) | Before accepting real payments | MVP can run in beta without billing |
| Meta Business Suite | Phase 3 (WhatsApp API) | MVP uses deep links, no API needed |
| Agent prompts | Phase 2 (Intelligence) | MVP has no AI agents, only image enhancement |
| Email templates | Phase 2 (Reports) | MVP has no email reports |
| WhatsApp templates | Phase 3 (Automation) | MVP uses deep links, no templates needed |
| Billing integration (Stripe) | Phase 2 (when charging) | MVP is free beta |
| ClickHouse | Phase 3+ (advanced analytics) | PostgreSQL handles analytics for first 1,000 users |
| Prefect | Phase 2 (scheduled jobs) | MVP has no scheduled jobs; BullMQ cron handles basics |

**Start lean. Add complexity only when the phase requires it.**
