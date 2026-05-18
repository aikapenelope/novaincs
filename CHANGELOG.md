# Changelog

All notable changes to the Qyne project are documented here.

---

## Sprint 17 — May 2026

**ERP-Lite: Expenses and Suppliers.** Merchants can now track expenses, manage suppliers, and see their real profit (Revenue - Expenses = Net Profit).

### Expenses

- **Expense CRUD** — `POST/GET/DELETE /expenses` with category, amount (USD + Bs), supplier link, payment method, receipt URL, invoice number.
- **P&L Summary** — `GET /expenses/summary` calculates Revenue - Expenses = Net Profit with margin percentage and category breakdown.
- **Categories** — `GET /expenses/categories` lists distinct categories with counts. Merchant-defined (inventory, rent, services, transport, marketing, etc.).
- **Period filtering** — All queries support `days` parameter (1-365).

### Suppliers

- **Supplier CRUD** — `POST/GET/PATCH/DELETE /suppliers` with name, contact, phone, email, RIF, address, products supplied, notes.
- **Search** — `GET /suppliers?search=` filters by name.
- **Expense linking** — Expenses can reference a supplier via `supplierId`.

### Database (Migration 0006)

- `suppliers` table with RLS and tenant isolation
- `expenses` table with RLS, indexes on tenant+date and tenant+category
- Grants for qyne_app and qyne_readonly roles

---

## Sprint 16 — May 2026

**AI Agents: Sales, Content, and Support.** Three new agents join the Finance Agent in production. Merchants can now get sales suggestions, generate product copy, and ask questions about their business data.

### Sales Agent ("The Closer")

- **Opportunity detection** — Analyzes CRM/RFM data to find at-risk customers, upsell potential, and cross-sell patterns.
- **Actionable suggestions** — Generates specific recommendations: WHO to contact, WHAT to say, WHY (data-backed), and HOW (draft message).
- **Re-engagement strategies** — Suggests personalized messages for dormant customer segments.

### Content Agent ("The Copywriter")

- **Product descriptions** — Short (catalog) and long (detail page) versions optimized for selling.
- **Social media copy** — Instagram captions with hashtags, hooks, and CTAs.
- **Promotional texts** — Sales announcements, new arrivals, limited-time offers.
- **3 tone options** — Professional, casual, and urgent variants for every output.
- **Venezuelan Spanish** — Adapted vocabulary and tone for the local market.

### Support Agent ("The Assistant")

- **Business Q&A** — Answers questions about sales, inventory, customers, orders, and finances.
- **Proactive insights** — Mentions noteworthy patterns when answering (stock alerts, trends).
- **Conversational interface** — Natural language queries instead of navigating dashboards.

### API

- **`POST /agents/chat`** — Unified endpoint to invoke any agent with message + context. Proxies to Agno AgentOS. Requires Pro or Business plan.
- **`GET /agents/list`** — Lists available agents and their status.
- **Plan gating** — AI agents require `ai_agents` feature (Pro+ plans only).

---

## Sprint 15 — May 2026

**Financial Dashboard + Google Sheets Import.** Merchants can now see revenue trends, product margins, and export reports. Products can be imported from Google Sheets via service account.

### Financial Dashboard

- **Analytics page** (`/analytics`) — Revenue trends (AreaChart), weekly revenue (BarChart), top products table, payment method breakdown, and product margins with percentage.
- **KPI cards** — Total revenue, order count, and average order value with period-over-period comparison.
- **nuxt-charts** — Modern SVG charts (Unovis/Tremor-inspired) integrated as Nuxt module.
- **Analytics API** — 5 endpoints: `GET /analytics/revenue`, `/products/top`, `/margins`, `/payment-methods`, `/summary`. All with configurable period (1-365 days) and previous-period comparison.

### Google Sheets Import

- **Service account auth** — No OAuth flow. Merchant shares their Google Sheet with Nova's service account email, pastes the URL, and imports.
- **Import API** — `GET /import/google-sheets/config` (service account email + instructions), `POST /preview` (list sheets), `POST /read` (preview data), `POST /execute` (import with column mapping).
- **Column mapping** — Merchant maps sheet columns to product fields (name, price, cost, stock, SKU, etc.). Validates and imports up to 2,000 rows.

### Mass Price Update

- **BCV recalculation** — `POST /products/recalculate-bs` updates all product Bs prices using the latest BCV exchange rate. Updates both products and variants.

### PDF & CSV Export

- **PDF report** — `GET /export/pdf` generates a sales report with pdfkit: store name, revenue summary, top products, payment method breakdown.
- **CSV export** — `GET /export/excel` generates a UTF-8 CSV with BOM for Excel compatibility. All verified orders with buyer info, amounts, and dates.

### Navigation

- **Finanzas** link added to dashboard sidebar.

---

## Sprint 13 — May 2026

**Smart Feed + Notifications.** The dashboard now shows AI-generated action cards and real-time notifications so merchants never miss what matters.

### Smart Feed

- **Feed items table** — `feed_items` with RLS, deduplication keys, priority ordering, and auto-expiry.
- **Feed generator worker** — BullMQ cron every 30 minutes. Generates action cards from CRM/RFM data: at-risk customers, pending payments, low stock alerts, new customers.
- **Feed API** — `GET /feed` (list with priority sort), `PATCH /feed/:id/read`, `PATCH /feed/:id/dismiss`, `POST /feed/read-all`.
- **Dashboard Smart Feed** — Action cards on the home page with priority indicators, dismiss buttons, and direct action links. Unread badge count.

### In-App Notifications

- **Notifications table** — `notifications` with RLS, tenant isolation, read/unread state.
- **Notification service** — `createNotification()` with convenience functions for common events: new order, payment uploaded, payment verified, low stock, new customer, order expired.
- **Notification triggers** — Automatic notifications on: new checkout order, payment verification, stock reservation expiry.
- **Notification API** — `GET /notifications` (list), `GET /notifications/unread-count` (lightweight polling), `PATCH /notifications/:id/read`, `POST /notifications/read-all`.
- **Notification Center** — Bell icon with unread badge in dashboard header. Dropdown panel with notification list, mark-all-read, and click-to-navigate. Polls every 30 seconds.

### Revenue Attribution

- **Revenue endpoint** — `GET /customers/:id/revenue` returns verified revenue, order count, and monthly breakdown for the last 12 months.

### Database

- **Migration 0004** — Creates `feed_items` and `notifications` tables with indexes, RLS policies, and role grants.

---

## Sprint 12 — May 17, 2026

**AI agents in production.** Finance Agent verifies payments, generates daily briefings, and tracks accounts receivable.

### Agno AgentOS (PRs #41-#48)

- **nova-agents container** — Agno AgentOS running on Coolify (port 8100, internal). Python 3.12, FastAPI, PostgreSQL storage (pg-agno), OpenRouter for LLM access.
- **Finance Agent** — "The Accountant" with OCR tool, knowledge base, guardrails (PII detection, prompt injection), learning machine, context compression.
- **Three model tiers** via OpenRouter: fast (gpt-4o-mini), tool (gpt-4o-mini), reasoning (gpt-5-mini) + Groq for ultra-fast tasks.
- **Knowledge base** — LanceDB local vectors with auto-indexing from `knowledge/` folder.
- **config.yaml** — AgentOS control plane UI configuration.

### Finance Agent OCR (PR #49)

- **Payment OCR service** — BullMQ worker calls Finance Agent to extract transaction details from Pago Movil/Zelle screenshots.
- **Auto-verification** — when confidence is high and extracted amount matches order total, payment is auto-verified without merchant intervention.
- **OCR endpoint** — `GET /payments/:id/ocr` returns extraction results for the dashboard.

### Daily Briefing (PR #50)

- **Morning summary** — BullMQ cron at 8 AM UTC gathers yesterday's sales, pending payments, top products, at-risk customers, negative-margin products.
- **AI summary** — Finance Agent generates natural-language briefing in Spanish. Falls back to data-only when agent is unavailable.
- **Endpoints** — `GET /briefing` (with AI), `GET /briefing/data` (raw data only).

### Accounts Receivable (PR #51)

- **Aging buckets** — `GET /receivables` groups unpaid orders: 0-7d (current), 7-15d (follow up), 15-30d (overdue), 30d+ (critical).
- **Expiring orders** — `GET /receivables/expiring` shows orders with stock reservation expiring within 6 hours.

### Documentation

- **Doc 19: Agno Deployment Log** — complete record of all 10 deployment problems and solutions.

---

## Sprint 11 — May 17, 2026

**CRM intelligence layer.** The system now knows who the merchant's customers are, how valuable they are, and which ones need attention.

### RFM Scoring (PR #39)

- **RFM scoring engine** — BullMQ cron every 6 hours. Calculates Recency/Frequency/Monetary scores (1-5) per customer with per-tenant quintile calibration.
- **Auto-segments** — VIP, Loyal, Potential Loyal, At Risk, Hibernating, New, One-Timer, Window Shopper.
- **API endpoints** — `GET /customers/segments` (breakdown), `GET /customers/at-risk` (re-engagement list), `POST /customers/rfm/recalculate` (manual trigger).

### Identity Merge (PR #39)

- **Visitor-to-customer linking** — when anonymous visitor checks out, `visitorId` from catalog PWA is sent with the order. All prior anonymous events are retroactively linked to the customer.
- **visitor_ids array** — customer record tracks all merged visitor sessions.

### Cart Abandonment (PR #39)

- **Detection worker** — BullMQ cron every 30 minutes. Finds `add_to_cart` events from 2-24 hours ago without a corresponding `checkout_complete`. Creates `cart_abandoned` event (once per visitor per day).
- **2-hour window** — accounts for Pago Movil transfers where buyer switches to banking app.

---

## Sprint 10 — May 17, 2026

**Production hardening + CRM foundation.** Fixed 4 critical production issues and built the base for the CRM module.

### Production Hardening (PR #37)

- **RLS context fix** — changed `set_config('app.current_tenant', ..., true)` to `false` (session-level) + `finally` cleanup. Prevents tenant data leaking across pooled connections.
- **Redis rate limiter** — replaced in-memory `Map` with Redis-backed `INCR` + `EXPIRE`. Survives restarts, works across instances.
- **Security headers** — `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **CI typecheck fix** — removed `continue-on-error: true`, now filters only the known vue-router/volar warning.

### CRM Foundation (PRs #37, #38)

- **Customer CRUD** — `GET/PATCH /customers` with search (name/phone), segment filter, pagination. Detail card with recent orders + event timeline.
- **Notes + Tags** — `PATCH /customers/:id/notes` (append with timestamp), `PUT /customers/:id/tags`.
- **Customer stats** — `GET /customers/stats` (total, segment breakdown, top by LTV).
- **Auto-customer sync** — `syncCustomerFromOrder` service calculates lifetime value and average order value on every order.
- **Behavioral beacon** — `POST /beacon` (single) and `POST /beacon/batch` (batch) for catalog PWA tracking. BullMQ worker inserts events into PostgreSQL.
- **useBeacon composable** — catalog PWA tracks page_view, product_view, add_to_cart, remove_from_cart, checkout_start with persistent visitor ID.

### Infrastructure

- **Redis eviction policy** — changed from `allkeys-lru` to `noeviction` for BullMQ job safety (PR #40).
- **Doc 18: Sprint 10 Hardening Status** — documents what was fixed and what's deferred.

---

## Sprint 9 — May 16, 2026

**Beta launch readiness.** End-to-end flow works without technical intervention.

### Onboarding (PR #33)

- **Onboarding wizard** (`/onboarding`) — 3-step flow for new merchants: create store (name + auto-slug), configure Pago Movil/Zelle, add first product. Auto-detects users with no tenant and redirects.
- **Product import** (`/products/import`) — upload CSV or Excel (.xlsx), client-side parsing with SheetJS, preview table, batch import up to 500 products. Auto-generates slugs, skips duplicates.
- **Full-text search** — catalog product search upgraded from ILIKE to PostgreSQL `to_tsvector('spanish', ...)` with prefix matching.
- **Catalog SEO** — OG tags on listing page, JSON-LD `Store` and `Product` schemas.

### Bug fixes (PR #33)

- **resolveTenant** — `GET /tenants/me` returns array of memberships, not single object. Dashboard now correctly reads first membership.
- **Tenant update schema** — added `description` field. Settings page can now save store description.

---

## Pre-Sprint 9: Production Blockers — May 16, 2026

### Auth & Settings (PR #32)

- **Clerk auth** — installed `@clerk/nuxt`, sign-in/sign-out UI, real session JWT in all API calls.
- **useApi rewrite** — replaced `dev-placeholder-token` with real Clerk `getToken()`. Zero placeholder values remain.
- **Payment config CRUD** — `GET/POST/PATCH/DELETE /payment-configs` API routes + dashboard page (`/settings/payments`).
- **Tenant settings** — dashboard page (`/settings`) for store name, description, WhatsApp phone.
- **Product list** — wired to real API (was last remaining placeholder page).

---

## Sprint 8 — May 16, 2026

### Orders Dashboard (PR #31)

- **Orders list** (`/orders`) — all orders with status filters and pagination.
- **Order detail** (`/orders/:id`) — items, buyer info (WhatsApp link), payment screenshot, verify/reject actions.
- **Status transitions** — verified -> preparing -> shipped -> delivered, with cancel and stock release.
- **Dashboard home** — real stats: today's sales, pending verifications, recent orders feed.

---

## Sprint 7 — May 16, 2026

### Checkout Flow (PRs #28, #29, #30)

- **Cart** — `useCart()` composable with localStorage persistence, sticky bottom bar, cart detail page.
- **Checkout** — 5-screen flow: cart -> buyer info (name + phone) -> payment method -> confirmation.
- **Pago Movil** — shows merchant bank details with "Copiar todo" button.
- **WhatsApp deep link** — structured order message with items, total, payment method.
- **Public catalog API** — `GET /catalog/:tenantSlug/products`, `/products/:slug`, `/payment-methods`.
- **Tenant routing** — all catalog pages under `/t/:tenantSlug/...`, zero hardcoded values.

---

## Sprint 6 — May 16, 2026

### BCV Dual Pricing (PR #28)

- **Exchange rate service** — fetches official BCV USD/VES rate from `ve.dolarapi.com`.
- **BullMQ worker** — refreshes rate every 15 min, immediate fetch on startup.
- **API routes** — `GET /exchange-rates/current`, `/convert`, `/history`.

---

## Production Audit Fixes — May 16, 2026

Full audit of repo, Pulumi stack, and live VPS. See `docs/17-PRODUCTION-AUDIT-MAY2026.md` for details.

### Fixed (PR #25)

- **R2 storage adapter** — replaced broken `fetch()` placeholder with `@aws-sdk/client-s3` (`PutObjectCommand`/`DeleteObjectCommand`). Image uploads to Cloudflare R2 now work.
- **Deep health check** — `/health` verifies PostgreSQL (`SELECT 1`) and Redis (`PING`). Returns 503 when DB is down, latency per check. Coolify/Traefik can now detect real failures.
- **Stock reservation cleanup** — BullMQ worker runs every 15 min, releases stock for expired unpaid orders, records inventory movements, marks orders as `expired`. Prevents phantom out-of-stock.

### Identified (deferred to hardening phase)

- SSH open to `0.0.0.0/0` (restrict to Tailscale before Sprint 15)
- Backups local-only, no offsite (fix before Sprint 9)
- Rate limiter in-memory, not Redis (fix before Sprint 9)
- RLS context may not persist across pooled connections (fix before Sprint 9)
- CI typecheck `continue-on-error: true` silences real errors
- No observability (Sentry, metrics, alerting)

---

## Sprint 4 Hardening — May 2026

### API Fixes

- **Product list now returns `total` count** — enables real pagination in frontend
- **Text search on products** — `?search=camisa` filters by name (ILIKE)
- **Variant PATCH endpoint** — `PATCH /products/:id/variants/:variantId` with stock recalculation
- **Variant DELETE endpoint** — `DELETE /products/:id/variants/:variantId`, auto-updates `hasVariants` flag
- **`recalculateProductStock` helper** — shared transaction logic for variant stock sync
- **Static file serving** — `/files/*` serves local uploads in development via `serveStatic`

### Dashboard Fixes

- **Create product form connected to API** — calls `POST /products` with all fields
- **Category selector** — `<select>` populated from `GET /categories`
- **Status selector** — active/draft toggle on create
- **Image upload functional** — `<input type="file">` calls `POST /uploads/image`, shows preview, supports remove
- **Product edit page** (`/products/[id]`) — loads existing data, PATCH on save, archive (soft-delete) button
- **Variant table** — read-only summary of variants on edit page
- **Success/error feedback** — toast-style messages on save

---

## Sprint 3 Hardening — May 2026

### Schema Overhaul (10 → 13 tables)

- **`product_variants`** — size/color/presentation with per-variant stock and price overrides
- **`payment_configs`** — merchant's Pago Movil/Zelle bank details (method, label, details JSONB)
- **`exchange_rates`** — BCV rate history for dual pricing and audit trail
- **`products`** — added `slug` (SEO URLs), `hasVariants`, `options` (axes definition)
- **`categories`** — added `description`, `imageUrl`
- **`tenants`** — `plan` varchar → `planTier` + `planOverrides` JSONB; added `domain`, `logoUrl`, `description`
- **`orders`** — added `buyerName`, `buyerPhone` (checkout capture), `expiresAt` (stock reservation TTL)
- **`order_items`** — added `tenant_id` (direct RLS, eliminated slow subquery), `variantId`, `variantName`
- **`customers`** — added `visitorIds` (identity merge tracking)

### Security

- **Auth middleware validates tenant membership** — queries `tenant_members`, returns 403 if not a member (was trusting `X-Tenant-Id` header blindly)
- **`tenantMiddleware` sets RLS context automatically** via `setTenantContext()`
- **RLS on all 13 tenant-scoped tables** (was missing `product_variants`, `payment_configs`)
- **`qyne_app` role** — non-superuser, RLS enforced at database level
- **`qyne_readonly` role** — SELECT-only for agent container

### Tests

- **8 RLS tests rewritten** — uses non-superuser connection so RLS is actually enforced
- Strict assertions: `expect(leaked.length).toBe(0)` instead of `toBeDefined()`
- Tests fail-closed behavior (empty context = zero rows)
- Tests INSERT isolation (cross-tenant insert blocked by RLS)

### Infrastructure

- **Drizzle relations** defined for all 13 tables — enables `db.query` with `{ with: ... }`
- **Automatic `updated_at` trigger** — PostgreSQL function on all tables with that column
- **3 migration files**: schema, RLS policies, roles + triggers

---

## Sprint 4 — May 2026

### API

- **Product CRUD** — `GET/POST/PATCH/DELETE /products` with Zod validation, slug uniqueness, soft-delete
- **Product by slug** — `GET /products/by-slug/:slug` for public catalog SEO URLs
- **Product variants** — `POST/GET /products/:id/variants` with transactional stock recalculation
- **Category CRUD** — `GET/POST/PATCH/DELETE /categories` with parent/child validation, circular reference protection
- **Category tree** — `GET /categories/tree` for navigation (top-level only)
- **Image upload** — `POST /uploads/image` with magic byte validation (JPEG/PNG/WebP/AVIF), 5MB limit

### Storage

- **`StorageAdapter` interface** — pluggable backend abstraction
- **`LocalStorageAdapter`** — filesystem storage for development
- **`R2StorageAdapter`** — Cloudflare R2 placeholder for production (needs AWS SDK integration)
- **Auto-selection** — uses R2 when `R2_ENDPOINT` is set, local otherwise

### Catalog PWA

- **Product listing** — responsive grid, dual pricing (USD + Bs), out-of-stock indicator
- **Product detail** — variant selector, computed effective price, stock status
- **SEO** — Open Graph meta tags for WhatsApp/social sharing
- **WhatsApp checkout** — deep link button with pre-filled order message

### Dashboard PWA

- **Sidebar layout** — navigation with Inicio, Productos
- **Home page** — welcome + stats placeholders
- **Product list** — grid with status filter (active/draft/archived), empty state
- **Create product** — full form with auto-slug, dual pricing, category selector, image upload
- **Edit product** — load existing data, save changes, archive button, variant summary

---

## Sprint 3 — May 2026

### Database

- **10 MVP tables** — tenants, tenant_members, products, categories, customers, customer_events, orders, order_items, payments, inventory_movements
- **Row-Level Security** — enabled on all tenant-scoped tables with 3-layer defense
- **Drizzle Kit** — migration system configured (`db:generate`, `db:migrate`, `db:studio`)

### Auth

- **Clerk JWT middleware** — verifies Bearer token, extracts userId
- **Tenant context** — `setTenantContext()` sets PostgreSQL session variable for RLS

### API

- **Tenant CRUD** — `POST /tenants`, `GET /tenants/me`, `GET /tenants/:id`, `PATCH /tenants/:id`

### Tests

- **5 RLS security tests** — tenant isolation verification (skipped without DATABASE_URL)

---

## Sprint 2 — May 2026

### Monorepo

- **pnpm workspace + turborepo** — 3 apps + 2 packages
- **`@qyne/api`** — Hono 4.x server with health check, error handler, Drizzle DB setup
- **`@qyne/dashboard`** — Nuxt 3 SSR (port 3001, deploys to Hetzner)
- **`@qyne/catalog`** — Nuxt 3 SSR with Cloudflare Workers preset (port 3002)
- **`@qyne/shared`** — TypeScript types for Tenant, Product, Customer, Order + plan constants
- **`@qyne/ui`** — placeholder for shared Vue components

### Infrastructure

- **Docker Compose** — local dev with 3x PostgreSQL (pgvector) + Redis 7
- **Pulumi ESC** — `qyne-infra/nova-app` environment with all secret placeholders
- **Prettier** — configured for monorepo

### Documentation

- **Doc 16: Production Hardening Layer** — 35 deferred operational items prioritized by severity

---

## Sprint 1 — May 2026 (pre-existing)

### Infrastructure (Pulumi IaC)

- **Hetzner CX43** — 8 vCPU, 16 GB RAM, 160 GB NVMe, Helsinki (hel1)
- **SSH key** (ED25519), private network (10.0.0.0/16), subnet (10.0.1.0/24)
- **Firewall** — SSH + HTTP + HTTPS
- **Cloud-init** — Docker + Dokploy + data directories
- **Delete/rebuild protection** enabled, automated backups enabled

### Server (running)

- pg-nova (PostgreSQL 16 + pgvector), pg-agno, pg-prefect
- Redis 7, Prefect 3, Dokploy + Traefik
- Memory: 2.1 GB / 15 GB (86% free)
