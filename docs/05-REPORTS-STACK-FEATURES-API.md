# Nova — Reports, Stack Alternatives, Complete Feature Registry & API Readiness

> **Status**: Planning Phase  
> **Last Updated**: May 2026  
> **Scope**: Report delivery system, stack comparison with two alternatives, complete feature registry, public API design, and product completeness assessment.

---

## Table of Contents

1. [Report Delivery System](#1-report-delivery-system)
2. [Stack Comparison: Three Alternatives](#2-stack-comparison-three-alternatives)
3. [Complete Feature Registry](#3-complete-feature-registry)
4. [API Readiness: Talking to Other Systems](#4-api-readiness-talking-to-other-systems)
5. [What's Still Missing: Product Completeness Audit](#5-whats-still-missing-product-completeness-audit)

---

## 1. Report Delivery System

### 1.1 Delivery Channels

**Primary: Email (via Resend)**

Monthly summaries and reports are delivered by email. This keeps the system decoupled from WhatsApp costs and limitations.

| Provider | Free Tier | Cost at Scale | Why |
|---|---|---|---|
| **Resend** | 3,000 emails/month free | $0.0004/email after | Best developer experience, React Email templates, TypeScript SDK, PDF attachments supported natively |
| Amazon SES | 3,000/month free (12 months) | $0.0001/email | Cheapest at scale but worse DX, no template system |
| SendGrid | 100/day free | $0.0004/email | Legacy, heavier, but battle-tested |

**Recommendation: Resend.** At 25,000 merchants x 2 reports/month = 50,000 emails/month = **$18.80/month** after free tier. Trivial cost.

**Secondary: WhatsApp (optional, for merchants who prefer it)**

WhatsApp Business API can send documents (PDFs). The cost structure since July 2025:

| Message Type | Cost (Rest of LATAM) | Notes |
|---|---|---|
| Utility (order confirmations, reports) | ~$0.008/message | Free if sent within 24h service window |
| Marketing (promotions, campaigns) | ~$0.063/message | Most expensive category |
| Service (replies to customer messages) | Free | Within 24h window |

Sending 2 PDF reports/month per merchant via WhatsApp utility messages:
- 25,000 merchants x 2 messages = 50,000 messages/month
- At $0.008/message = **$400/month**

That's 21x more expensive than email ($18.80 vs $400). Email is the clear winner for reports.

**Hybrid approach**: Reports are always sent by email. The merchant gets a WhatsApp notification (free, within service window if they've messaged recently) that says "Tu resumen mensual esta listo. Revisalo en tu email o en la app." with a link to view it in the dashboard.

### 1.2 Report Types and Schedule

| Report | Frequency | Delivery | Content |
|---|---|---|---|
| **Daily Briefing** | Daily, 8am | In-app only (push notification) | Today's agenda, pending payments, AI suggestions |
| **Weekly Summary** | Every Monday, 8am | In-app + email | Week's sales, top products, customer activity, inventory alerts |
| **Monthly Report** | 1st of month, 8am | Email (PDF) + in-app | Full financial summary, customer analytics, inventory valuation, comparisons |
| **Quarterly Review** | 1st of quarter | Email (PDF) + in-app | Trends, growth metrics, seasonal patterns, recommendations |

### 1.3 Monthly Report: PDF Structure

The PDF is generated server-side using a headless renderer (Puppeteer or @react-pdf/renderer) and attached to the Resend email.

```
┌─────────────────────────────────────────┐
│  NOVA — Resumen Mensual                 │
│  Tienda: Carlos Fashion                 │
│  Periodo: Abril 2026                    │
│                                         │
│  ═══════════════════════════════════     │
│  RESUMEN EJECUTIVO                      │
│  Ventas: $1,847 (+12% vs marzo)         │
│  Ordenes: 124                           │
│  Clientes activos: 47                   │
│  Margen estimado: 42%                   │
│  ═══════════════════════════════════     │
│                                         │
│  VENTAS POR SEMANA                      │
│  [Bar chart: 4 weeks]                   │
│                                         │
│  TOP 5 PRODUCTOS                        │
│  1. Camisa Polo Azul — 48 uds — $720   │
│  2. Zapatos Nike Air — 12 uds — $540   │
│  ...                                    │
│                                         │
│  TOP 5 CLIENTES                         │
│  1. Maria Rodriguez — $203 — VIP        │
│  2. Juan Perez — $108 — Frecuente       │
│  ...                                    │
│                                         │
│  CLIENTES                               │
│  Nuevos: 12 | Recurrentes: 35 (74%)     │
│  En riesgo: 5 | Perdidos: 2             │
│                                         │
│  INVENTARIO                             │
│  Productos activos: 83                  │
│  Agotados: 4 | Sin venta (30d): 12      │
│  Valor estimado: $2,340                 │
│                                         │
│  CUENTAS POR COBRAR                     │
│  Pendiente: $134 (3 clientes)           │
│  Mas antigua: 8 dias (Juan Perez)       │
│                                         │
│  METODOS DE PAGO                        │
│  Pago Movil: 78% | Zelle: 15%          │
│  Efectivo: 7%                           │
│                                         │
│  RECOMENDACIONES DEL MES                │
│  (generadas por AI agents)              │
│  • 5 clientes en riesgo de perderse.    │
│    Enviar campana de retencion.         │
│  • Camisa Polo tiene margen de 52%.     │
│    Considerar promocion para mover      │
│    mas volumen.                         │
│  • Sabados son tu mejor dia (28% de     │
│    ventas). Publicar contenido nuevo    │
│    los viernes por la noche.            │
│                                         │
│  ─────────────────────────────────      │
│  Generado por Nova | nova.app           │
└─────────────────────────────────────────┘
```

### 1.4 Implementation

```
Temporal Cron Workflow (1st of month, 8am per timezone)
  → Finance Agent: query all financial data for the month
  → Content Agent: generate recommendations based on patterns
  → PDF Generator: render HTML template → PDF (Puppeteer)
  → MinIO: store PDF (for in-app download)
  → Resend API: send email with PDF attachment
  → In-app: create notification card with link to report
  → (Optional) WhatsApp: send notification "Tu resumen esta listo"
```

The Temporal workflow ensures that if any step fails (e.g., Resend is down), it retries automatically. The merchant always gets their report.

### 1.5 What Else Is Needed for Reports

| Item | Status | Notes |
|---|---|---|
| Email collection during onboarding | **Needed** | Add email field to merchant signup (Clerk already captures it) |
| Email template design | **Needed** | React Email components for weekly/monthly reports |
| PDF generation service | **Needed** | Puppeteer or @react-pdf/renderer running as a BullMQ worker |
| Timezone handling | **Needed** | Reports should arrive at 8am in the merchant's timezone, not UTC |
| Unsubscribe mechanism | **Needed** | Legal requirement. One-click unsubscribe link in every email |
| Email domain setup | **Needed** | Custom domain (e.g., reports@nova.app) with SPF/DKIM/DMARC for deliverability |

---

## 2. Stack Comparison: Three Alternatives

### 2.1 The Three Stacks

| Component | **Stack A: Hono (Chosen)** | **Stack B: Encore.ts** | **Stack C: NestJS** |
|---|---|---|---|
| API Framework | Hono 4.x | Encore.ts | NestJS 11.x |
| ORM | Drizzle | Encore built-in SQL | Prisma 7 or TypeORM |
| Auth | Clerk | Clerk | Clerk |
| Frontend | Nuxt 3 | Nuxt 3 | Nuxt 3 |
| Database | PostgreSQL 16 + pgvector | PostgreSQL (auto-provisioned) | PostgreSQL 16 + pgvector |
| Queue | BullMQ on Redis | Encore Pub/Sub (built-in) | BullMQ on Redis |
| Workflow | Temporal.io | Encore Cron + custom | Temporal.io |
| Observability | OpenTelemetry + Grafana | Built-in (automatic) | OpenTelemetry + Grafana |
| Agent Framework | Agno | Agno | Agno |
| Bundle size | ~14kb (Hono) + ~7.4kb (Drizzle) | Larger (Rust runtime) | ~14MB+ (NestJS + decorators) |
| Boilerplate | Low | Very low | High |
| Learning curve | Low | Low-Medium | High |
| Infrastructure control | Full (you manage everything) | Partial (Encore manages infra) | Full (you manage everything) |
| Multi-runtime | Node, Bun, Deno, CF Workers | Node only (Rust runtime) | Node only |
| Community size | Growing fast | Smaller (11K stars) | Very large (70K+ stars) |

### 2.2 Stack B: Encore.ts — Why It's a Strong Alternative

**Advantages over Hono:**
- Infrastructure-from-code: declare a database in one line, Encore provisions it automatically (local dev and production)
- Built-in distributed tracing without any setup (OpenTelemetry is automatic)
- Type-safe service-to-service calls (services are just folders, calls are just functions)
- Auto-generated API documentation and service catalog
- 9x faster than Express (Rust runtime handles I/O)
- Pub/Sub and cron jobs built-in (no BullMQ needed)

**Disadvantages:**
- **Vendor coupling**: Encore Cloud deploys to your AWS/GCP account, but the framework conventions are Encore-specific. If you outgrow Encore, migration is non-trivial.
- **No edge runtime support**: Can't run on Cloudflare Workers or Deno Deploy. Hono can.
- **Smaller ecosystem**: 11K GitHub stars vs Hono's rapid growth. Fewer community plugins.
- **Opinionated infrastructure**: Encore decides how your database, queues, and cron jobs work. With Hono + Drizzle + BullMQ, you choose each piece independently.
- **Self-hosting complexity**: Encore is designed for Encore Cloud. Self-hosting on Hetzner (our target) requires Docker export and manual infrastructure setup, losing many of the "automatic" benefits.

**Verdict**: Encore.ts would be the best choice if we were deploying to AWS/GCP. Since we're targeting Hetzner (dedicated servers, cost-optimized for LATAM), Encore's main advantage (automatic infrastructure provisioning) doesn't apply. We'd be using Encore's framework conventions without getting the infrastructure benefits.

### 2.3 Stack C: NestJS — Why It's the Enterprise Default

**Advantages over Hono:**
- Largest TypeScript backend community (70K+ stars)
- Angular-style architecture with dependency injection (familiar to many developers)
- Extensive ecosystem: GraphQL, WebSockets, microservices, CQRS, all built-in
- Most hiring pool (many developers know NestJS)
- Mature, battle-tested in production at scale

**Disadvantages:**
- **Heavy boilerplate**: A simple endpoint requires controller + service + module + DTO + decorator. In Hono, it's one function.
- **Decorator-heavy**: Types are lost at runtime without class-validator. Drizzle infers types from the schema; NestJS requires separate DTO classes.
- **Bundle size**: ~14MB+ vs Hono's 14kb. Matters for cold starts and serverless.
- **Performance**: Moderate. Hono and Encore are significantly faster.
- **Overengineered for our scale**: NestJS shines with 10+ developers on a team. For a small team building Nova, the ceremony slows development without proportional benefit.
- **Learning curve**: High. Decorators, DI containers, modules, guards, interceptors, pipes — a lot of concepts before you write business logic.

**Verdict**: NestJS is the safe, enterprise choice. If Nova had a 10-person engineering team and needed to hire frequently, NestJS would be the pragmatic pick. For a small team moving fast, the boilerplate overhead is a net negative.

### 2.4 Why Hono Was Chosen

| Criterion | Weight | Hono | Encore.ts | NestJS |
|---|---|---|---|---|
| Speed of development (small team) | High | 9/10 | 8/10 | 5/10 |
| Performance | Medium | 9/10 | 10/10 | 6/10 |
| Self-hosting on Hetzner | High | 10/10 | 5/10 | 10/10 |
| Bundle size / cold starts | Medium | 10/10 | 7/10 | 3/10 |
| Future flexibility (multi-runtime) | Medium | 10/10 | 4/10 | 4/10 |
| Ecosystem / community | Low | 7/10 | 5/10 | 10/10 |
| Infrastructure automation | Low | 3/10 | 10/10 | 3/10 |
| **Weighted Total** | | **8.7** | **6.8** | **5.8** |

Hono wins because:
1. **Minimal overhead** for a small team (less code = fewer bugs = faster shipping)
2. **Full control** over infrastructure (critical for Hetzner self-hosting)
3. **Multi-runtime future-proofing** (can move to edge/serverless later without rewriting)
4. **Pairs perfectly with Drizzle** (both are lightweight, SQL-first, TypeScript-native)
5. **Agno integration is framework-agnostic** (Agno doesn't care if the HTTP layer is Hono, NestJS, or Express)

---

## 3. Complete Feature Registry

Every feature Nova will have, organized by module, with implementation status targets.

### 3.1 Catalog & Products

| # | Feature | Plan | Phase |
|---|---|---|---|
| C1 | Create product (name, description, price, category) | Free | MVP |
| C2 | Product variants (size, color, presentation) | Free | MVP |
| C3 | Dual pricing (USD + Bs with auto-conversion) | Free | MVP |
| C4 | Product images (upload from phone camera) | Free | MVP |
| C5 | AI image enhancement (background removal, staging) | Free (10/mo), Paid (unlimited) | MVP |
| C6 | Public catalog PWA (shareable URL) | Free | MVP |
| C7 | Catalog SEO (meta tags, Open Graph, structured data) | Free | MVP |
| C8 | Product search (text-based) | Free | MVP |
| C9 | Product categories and subcategories | Free | MVP |
| C10 | Bulk import from Excel/CSV | Free | MVP |
| C11 | Google Sheets import via MCP Migration Agent | Paid | Phase 2 |
| C12 | Product semantic search (pgvector) | Paid | Phase 2 |
| C13 | QR code per product | Premium+ | Future |
| C14 | "Modo Vitrina" Instagram image generator | Premium+ | Future |

### 3.2 Checkout & Payments

| # | Feature | Plan | Phase |
|---|---|---|---|
| P1 | Shopping cart with sticky bottom bar | Free | MVP |
| P2 | Cart detail with quantity adjustment | Free | MVP |
| P3 | Buyer info form (name + phone, 2 required fields) | Free | MVP |
| P4 | Delivery/pickup selection | Free | MVP |
| P5 | Pago Movil payment flow (copy data + upload screenshot) | Free | MVP |
| P6 | Zelle payment flow (show data + reference field) | Free | MVP |
| P7 | Cash on delivery option | Free | MVP |
| P8 | Payment screenshot upload | Free | MVP |
| P9 | OCR auto-verification of screenshots | Paid | Phase 2 |
| P10 | Unique payment link per order (nova.app/pay/xxx) | Free | MVP |
| P11 | WhatsApp deep link with structured order message | Free | MVP |
| P12 | Returning customer auto-fill (cookie-based) | Free | MVP |
| P13 | Browser geolocation capture for delivery | Free | MVP |
| P14 | Stock reservation on checkout (24h expiry) | Free | MVP |
| P15 | Exchange rate auto-update for Bs prices | Paid | Phase 2 |
| P16 | Mass price update when rate changes | Paid | Phase 2 |

### 3.3 Micro-CRM

| # | Feature | Plan | Phase |
|---|---|---|---|
| R1 | Auto-populated customer profiles from orders | Free | MVP |
| R2 | Customer list with search | Free | MVP |
| R3 | Customer detail card (name, phone, orders, value) | Free | MVP |
| R4 | Manual notes on customers | Free | MVP |
| R5 | Custom tags on customers | Free | MVP |
| R6 | RFM scoring (auto-calculated, per-merchant calibrated) | Paid | Phase 2 |
| R7 | Auto-segments (VIP, At Risk, New, etc.) | Paid | Phase 2 |
| R8 | Customer timeline (full interaction history) | Paid | Phase 2 |
| R9 | Behavioral tracking (catalog visits, product views) | Paid | Phase 2 |
| R10 | Cart abandonment detection | Paid | Phase 2 |
| R11 | Customer identity merge (anonymous → identified) | Paid | Phase 2 |
| R12 | WhatsApp BSUID support (June 2026+) | Paid | Phase 2 |
| R13 | Meta Pixel integration (client-side) | Paid | Phase 3 |
| R14 | Meta Conversions API (server-side) | Paid | Phase 3 |

### 3.4 Inventory

| # | Feature | Plan | Phase |
|---|---|---|---|
| I1 | Stock per product/variant | Free | MVP |
| I2 | Swipe adjustment (+/-) | Free | MVP |
| I3 | Low stock alerts (push notification) | Free | MVP |
| I4 | Movement history | Free | MVP |
| I5 | Unit cost and auto-calculated margin | Paid | Phase 2 |
| I6 | Barcode scanning via camera | Paid | Phase 3 |
| I7 | Inventory valuation report | Paid | Phase 3 |

### 3.5 Orders & Sales

| # | Feature | Plan | Phase |
|---|---|---|---|
| O1 | Order list with status filters | Free | MVP |
| O2 | Order detail (items, buyer, payment status) | Free | MVP |
| O3 | Mark as paid (manual) | Free | MVP |
| O4 | Mark as shipped/delivered | Free | MVP |
| O5 | Daily sales total (in-app) | Free | MVP |
| O6 | Weekly sales summary (in-app + email) | Paid | Phase 2 |
| O7 | Monthly report (email PDF + in-app) | Paid | Phase 2 |
| O8 | Quarterly review (email PDF + in-app) | Paid | Phase 3 |
| O9 | Accounts receivable tracking with aging | Paid | Phase 2 |
| O10 | Payment reminder suggestions | Paid | Phase 2 |
| O11 | PDF/Excel export of sales data | Paid | Phase 2 |

### 3.6 Financial Dashboard

| # | Feature | Plan | Phase |
|---|---|---|---|
| F1 | Daily/weekly/monthly income view | Paid | Phase 2 |
| F2 | Margin per product (if cost entered) | Paid | Phase 2 |
| F3 | Cash flow (inflows vs outflows) | Paid | Phase 2 |
| F4 | Top products by revenue and profitability | Paid | Phase 2 |
| F5 | Top customers by value | Paid | Phase 2 |
| F6 | Period vs period comparison | Paid | Phase 3 |
| F7 | 7-day and 30-day revenue projection | Paid | Phase 3 |
| F8 | Payment method distribution | Paid | Phase 2 |
| F9 | Exchange rate impact analysis | Paid | Phase 3 |

### 3.7 Messaging & WhatsApp

| # | Feature | Plan | Phase |
|---|---|---|---|
| M1 | WhatsApp deep link checkout (pre-filled message) | Free | MVP |
| M2 | Order notification to merchant (in-app push) | Free | MVP |
| M3 | WhatsApp Business API integration | Paid | Phase 3 |
| M4 | Broadcast messages by CRM segment | Paid | Phase 3 |
| M5 | Automated welcome message | Paid | Phase 3 |
| M6 | Abandoned cart recovery message | Paid | Phase 3 |
| M7 | Post-sale follow-up message | Paid | Phase 3 |
| M8 | Wakit integration (full conversation access) | Premium+ | Future |

### 3.8 AI & Agents

| # | Feature | Plan | Phase |
|---|---|---|---|
| A1 | AI image enhancement (Photoroom API) | Free (10/mo) | MVP |
| A2 | Daily briefing (AI-generated) | Paid | Phase 2 |
| A3 | Smart feed with action suggestions | Paid | Phase 2 |
| A4 | Sales Agent (detect opportunities, suggest actions) | Paid | Phase 3 |
| A5 | Finance Agent (OCR, summaries, alerts) | Paid | Phase 2 |
| A6 | Content Agent (image generation, descriptions) | Paid | Phase 3 |
| A7 | Support Agent (voice commands, Q&A) | Paid | Phase 3 |
| A8 | AI autonomous mode (agents act without approval) | Premium+ | Future |
| A9 | Voice commands (Groq Whisper) | Premium+ | Future |

### 3.9 Integrations

| # | Feature | Plan | Phase |
|---|---|---|---|
| X1 | Excel/CSV import | Free | MVP |
| X2 | Excel/CSV export | Free | MVP |
| X3 | Google Sheets import (MCP Migration Agent) | Paid | Phase 2 |
| X4 | Google Sheets bidirectional sync | Paid | Phase 3 |
| X5 | Meta Pixel | Paid | Phase 3 |
| X6 | Meta Conversions API | Paid | Phase 3 |
| X7 | Exchange rate API (BCV) | Paid | Phase 2 |
| X8 | Webhooks (outgoing, for custom integrations) | Paid | Phase 3 |
| X9 | Public REST API (documented, versioned) | Paid | Phase 4 |
| X10 | MCP Server (for external agent access) | Premium+ | Future |
| X11 | Wakit WhatsApp integration | Premium+ | Future |

### 3.10 Platform & Settings

| # | Feature | Plan | Phase |
|---|---|---|---|
| S1 | Merchant onboarding wizard | Free | MVP |
| S2 | Store settings (name, logo, contact info) | Free | MVP |
| S3 | Payment method configuration (Pago Movil/Zelle data) | Free | MVP |
| S4 | Delivery zone configuration | Free | MVP |
| S5 | Notification preferences | Free | MVP |
| S6 | Email report preferences | Paid | Phase 2 |
| S7 | Plan management and billing | All | Phase 2 |
| S8 | Data export (full account data) | Free | Phase 2 |

**Total: 89 features** across 10 modules.

---

## 4. API Readiness: Talking to Other Systems

### 4.1 Internal API (Day 1)

From day one, Nova's backend is an API. The Hono server exposes RESTful endpoints that the Nuxt 3 frontends consume. This means the API already exists — it just needs to be documented and versioned for external use.

```
Nova Backend (Hono)
  ├── /api/v1/products      (CRUD)
  ├── /api/v1/customers     (CRUD + search)
  ├── /api/v1/orders        (CRUD + status updates)
  ├── /api/v1/inventory     (adjustments, movements)
  ├── /api/v1/payments      (verification, status)
  ├── /api/v1/analytics     (summaries, reports)
  ├── /api/v1/catalog       (public, read-only)
  └── /api/v1/webhooks      (configuration)
```

### 4.2 Public API (Phase 4)

When the public API launches, it exposes the same endpoints with:

- **API key authentication** (per-merchant, generated in settings)
- **Rate limiting** (per plan: Free = 100 req/hr, Paid = 1,000 req/hr, Premium = 10,000 req/hr)
- **Versioning** (URL-based: `/api/v1/`, `/api/v2/`)
- **OpenAPI spec** (auto-generated from Hono route definitions)
- **Webhook subscriptions** (merchant configures URLs to receive events)

### 4.3 What External Systems Can Do

| System | Integration Method | What They Can Do |
|---|---|---|
| **Custom website** | REST API | Read catalog, create orders, check stock |
| **Accounting software** | REST API + webhooks | Receive sales data, payment confirmations |
| **Delivery service** | REST API + webhooks | Receive orders, update delivery status |
| **Marketing tool** | REST API + webhooks | Read customer segments, trigger campaigns |
| **AI agent (external)** | MCP Server | Full read/write access to all Nova data |
| **Zapier / Make** | Webhooks | Trigger automations on Nova events |
| **Google Sheets** | MCP (bidirectional) | Sync products, customers, sales |
| **Wakit (WhatsApp)** | MCP (bidirectional) | Match conversations to CRM, agent replies |

### 4.4 Webhook Events

Nova emits events that external systems can subscribe to:

| Event | Payload | Use Case |
|---|---|---|
| `order.created` | Order details + items + buyer | Trigger fulfillment workflow |
| `order.paid` | Order + payment details | Update accounting system |
| `order.shipped` | Order + tracking info | Notify delivery service |
| `customer.created` | Customer profile | Sync to external CRM |
| `customer.segment_changed` | Customer + old/new segment | Trigger marketing automation |
| `product.low_stock` | Product + current stock | Trigger reorder workflow |
| `product.out_of_stock` | Product | Update external catalog |
| `payment.verified` | Payment details | Update accounting |
| `payment.failed` | Payment + reason | Alert merchant |
| `report.generated` | Report type + download URL | Archive in external system |

---

## 5. What's Still Missing: Product Completeness Audit

### 5.1 Covered Categories

| Category | Status | Coverage |
|---|---|---|
| Customer acquisition (catalog, images, SEO) | Covered | Complete |
| Conversion (checkout, payments, WhatsApp) | Covered | Complete |
| Retention (CRM, segments, campaigns) | Covered | Complete |
| Intelligence (agents, briefings, reports) | Covered | Complete |
| Operations (inventory, orders, delivery) | Covered | Complete |
| Growth (content, Meta Pixel, broadcasts) | Covered | Complete |
| Migration (Excel, Google Sheets, MCP agent) | Covered | Complete |
| Integration (API, webhooks, MCP, Wakit) | Covered | Complete |
| Reporting (email, PDF, in-app) | Covered | Complete |
| Multi-tenancy (RLS, single-user, isolation) | Covered | Complete |

### 5.2 What Could Still Be Added (Post-Launch, Based on User Feedback)

| Opportunity | Value | Effort | When |
|---|---|---|---|
| **Supplier management** | Track who supplies what, reorder points, purchase orders | Medium | Post-launch if merchants request it |
| **Expense tracking** | Manual expense entry for accurate profit calculation | Low | Phase 2 (simple form + categorization) |
| **Multi-currency ledger** | Track Bs and USD balances separately with conversion history | Medium | Phase 3 (complex accounting logic) |
| **Customer loyalty program** | Points, tiers, rewards for repeat purchases | Medium | Phase 3 |
| **Referral system** | Reward customers who share the catalog and bring new buyers | Low | Phase 3 (track referral links) |
| **A/B testing for catalog** | Test different product photos/descriptions/prices | High | Future (requires significant analytics) |
| **Appointment booking** | For service businesses (barbers, salons, mechanics) | Medium | Future (different product category) |
| **Multi-store** | One merchant, multiple physical locations with separate inventory | High | Future (schema changes needed) |
| **Team/employee access** | Multiple users per merchant with roles | Medium | Future (add tenant_members table back) |

### 5.3 Final Assessment

The product as defined across all five documents (01 through 05) covers **89 features across 10 modules**, with a clear phased rollout from MVP to Platform.

**What makes it complete:**
- Every step of the merchant's daily workflow is covered (add product → share → sell → collect → track → grow)
- Every step of the buyer's journey is covered (discover → browse → cart → pay → receive)
- Intelligence is built into every layer (not bolted on)
- The architecture supports future expansion without rewrites (composable, API-first, MCP-native)
- Reports and analytics close the feedback loop (the merchant knows what's working)

**What makes it defensible:**
- Behavioral data accumulation (can't be replicated without time)
- AI agents trained on Venezuelan commerce patterns (domain expertise)
- MCP integration network (each integration is a barrier to entry)
- Embedded finance readiness (data foundation for future financial products)

**What makes it shippable:**
- MVP is 16 features across 4 modules (achievable in 8-12 weeks)
- Each phase adds value independently (no "big bang" launch required)
- Single-user tenancy simplifies everything (no team management complexity)
- Hono + Drizzle + Nuxt 3 is a fast-moving stack for a small team

The product is complete for its target market and use case. Additional features should be driven by merchant feedback after launch, not by pre-launch speculation.
