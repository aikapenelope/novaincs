# Changelog

All notable changes to the Qyne project are documented here.

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
