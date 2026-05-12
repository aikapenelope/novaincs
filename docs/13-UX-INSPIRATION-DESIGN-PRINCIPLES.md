# Nova — UX Inspiration Analysis & Design Principles

> **Status**: Planning Phase  
> **Last Updated**: May 2026  
> **Scope**: Competitive UX analysis (Treinta, Take.app, Loyverse, Shopify, WhatsApp Business), design principles for both PWAs, and how agents work invisibly behind simple interfaces.

---

## 1. Treinta: What to Copy, What to Avoid

### What Treinta Does Well

**2-second sale registration**: Tap "Nueva venta" → select product from list → enter amount → done. No forms, no sub-menus. This speed of input is the gold standard for merchant-facing UX in LATAM. Nova's dashboard must match or beat this.

**Shareable catalog link**: Treinta generates a web URL the merchant shares via WhatsApp. The buyer doesn't download anything. This is exactly what Nova's catalog PWA does — but Nova does it better because it's a real PWA on Cloudflare Workers, not a static page generator.

**Simple stats on home screen**: Treinta shows today's income and expenses as big numbers on the main screen. No complex charts. Just "Hoy: $127 ingresos, $45 gastos." Nova's Home feed should start with this same clarity.

**Spanish-first, no jargon**: Treinta uses language the merchant understands. "Ventas", "Gastos", "Deudas" — not "Revenue", "P&L", "Accounts Receivable." Nova must follow this pattern.

### What Treinta Does Poorly

**It's a register, not an assistant**: Treinta records what happened. It never suggests what to do next. The merchant has to interpret data alone. Nova's agents close this gap — the system interprets and suggests.

**The virtual catalog is fragile**: App Store and Google Play reviews consistently report that Treinta's catalog fails, doesn't load, or loses data during updates. This is because the catalog was built as an afterthought, not as the core product. In Nova, the catalog IS the product — it's the first thing built and the thing that works best.

**No connection to the buyer**: Treinta doesn't know who visits the catalog. No behavioral tracking. No CRM. It's a digital ledger, not a growth tool.

**No image enhancement**: The merchant uploads whatever photo they took. No AI improvement. Products look the same as they would on Instagram — amateur.

### What Nova Takes from Treinta

- Speed of input (register a sale in 2-3 taps)
- Big numbers on the home screen (today's sales, pending payments)
- Spanish-first language with zero jargon
- Shareable catalog link as the primary distribution method

### What Nova Adds That Treinta Can't

- AI image enhancement (photos look professional)
- Behavioral CRM (know who visits, who buys, who's at risk)
- Proactive suggestions (agents tell the merchant what to do)
- Payment verification (OCR on screenshots)
- Voice/text input ("vendí 3 camisas a Juan por $45")

---

## 2. Other UX Inspirations

### Take.app — For the Buyer Catalog PWA

**What to copy**:
- Clean checkout in 3 steps: select products → enter info → pay
- Native WhatsApp integration (order arrives as structured message)
- Large product photos with visible price and prominent buy button
- Category navigation as horizontal scrollable chips at the top
- No account creation required — buy as guest

**What to avoid**:
- Take.app's pricing page is confusing (too many tiers)
- The dashboard is oriented to food/restaurant businesses — Nova is broader

**Nova's catalog should feel like Take.app but with**: AI-enhanced photos, Pago Movil/Zelle native payment, and behavioral tracking invisible to the buyer.

### Loyverse POS — For the Merchant Dashboard

**What to copy**:
- Home screen = product grid with large photos
- One tap to register a sale
- Inventory adjusts automatically on sale
- Simple reports: "Today you sold $X"
- Offline mode (works without internet, syncs later)

**What to avoid**:
- Loyverse is POS-first (designed for physical point of sale with receipt printers). Nova is catalog-first (designed for WhatsApp/Instagram sales).
- Loyverse's CRM is basic (just a customer list with purchase history). Nova's CRM is behavioral.

**Nova's dashboard should feel like Loyverse but with**: AI suggestions in the feed, voice input, and proactive notifications.

### Shopify Mobile App — For Product Management

**What to copy**:
- Add product = photo + name + price (3 fields minimum)
- Variants (size, color) as tappable chips below the product
- Inventory as an inline editable number
- Drag to reorder products in the catalog
- Product status toggle (active/draft/archived)

**What to avoid**:
- Shopify's mobile app is complex (hundreds of settings). Nova must stay simple.
- Shopify requires understanding of "channels", "collections", "metafields" — concepts that confuse micro-merchants.

**Nova's product management should feel like Shopify's simplicity but without**: the complexity of channels, themes, apps, and settings.

### WhatsApp Business Catalog — For the Buyer Experience

**What to copy**:
- Products displayed as cards with photo + price
- Tap a product to see detail (description, more photos)
- "Message business" button closes the loop
- Feels native to WhatsApp users (familiar UI patterns)

**What to avoid**:
- WhatsApp Business catalog has no cart, no checkout, no payment. It's just a showcase.
- Limited to 500 products. No categories. No search.

**Nova's catalog should feel like WhatsApp Business catalog but with**: full cart, checkout, payment flow, search, categories, and unlimited products.

---

## 3. Design Principles for Nova

### Principle 1: The Agent is Invisible

The merchant never "uses" an AI agent. They never see a chatbot interface (unless they open the AI Command Center). Instead, they see the RESULTS of agent work:

- A suggestion card in the feed: "Maria hasn't bought in 15 days. Send coupon?"
- A morning briefing: "Yesterday you sold $127. 3 payments pending."
- An alert: "Camisa Polo has 2 units left. Restock?"
- A pre-filled sale when they say "vendí 3 camisas a Juan"

The agent works behind every screen, but the merchant only sees simple cards with action buttons.

### Principle 2: Input is Fast, Output is Rich

**Input** (what the merchant does): 2-3 taps, or a voice note, or a photo upload. Never a form with more than 3 fields.

**Output** (what the system shows): Rich cards with context, history, suggestions, and one-tap actions. The system does the thinking; the merchant does the deciding.

```
MERCHANT INPUT          →  SYSTEM OUTPUT
──────────────────         ─────────────────────────────────
Tap "+" → select product   Order created, inventory adjusted,
→ select customer → done   CRM updated, RFM recalculated,
                           receipt ready, WhatsApp message drafted

Take photo of product      AI-enhanced photo, background removed,
                           product card created, catalog updated,
                           SEO meta tags generated

Voice: "vendí 5 camisas    Order created for 5 Camisas Polo Azul
a Juan por 75 dolares"     to Juan Perez, $75, payment pending,
                           inventory -5, CRM updated
```

### Principle 3: Progressive Disclosure

The merchant never sees all features at once. The interface reveals complexity as the merchant grows:

| Week | What They See | What's Hidden |
|---|---|---|
| Week 1 | Catalog + Orders + Payments | CRM, Finance, AI, Reports |
| Week 2 (10+ customers) | + Customer list appears | Finance, AI, Reports |
| Week 3 (20+ sales) | + Finance tab appears | AI, Reports |
| Week 4 (patterns emerge) | + AI suggestions in feed | Reports |
| Month 2 | + Monthly report arrives by email | Everything visible |

New features appear with a subtle animation and a tooltip: "Nuevo: Ya tienes 10 clientes. Mira quienes son tus mejores compradores."

### Principle 4: Two PWAs, Two Personalities

**Catalog PWA (buyer)**: Clean, visual, fast. Large photos, minimal text, prominent prices, big buttons. Feels like browsing Instagram or a WhatsApp Business catalog. Colors match the merchant's brand. No Nova branding visible (white-label feel).

**Dashboard PWA (merchant)**: Warm, informative, actionable. Feed-based home screen with cards. Bottom navigation with 4-5 tabs. Dark mode available. Nova branding visible. Feels like a mix of Instagram (feed) + Treinta (speed) + a smart assistant (suggestions).

### Principle 5: Every Screen Has One Primary Action

No screen should make the merchant think "what do I do here?" Every screen has ONE obvious action:

| Screen | Primary Action | Button |
|---|---|---|
| Home | Review today's activity | "Ver pedidos pendientes" |
| Products | Add a product | "+" floating button |
| Orders | Verify a payment | "Verificar pago" on pending order |
| Customers | Write to a customer | "Enviar mensaje" on customer card |
| Finance | See today's numbers | Numbers are the screen (no action needed) |

---

## 4. What Follows to Start Development

### Everything Defined (12 docs + README)

| Document | What It Covers | Status |
|---|---|---|
| 01 | Market, competition, buyer persona, architecture, stack | Done |
| 02 | CRM value, data ingestion, migration, multi-tenant | Done |
| 03 | Customer identity, DB sizing, Wakit, MCP agent | Done |
| 04 | Checkout flow, dashboard UX, inventory sync, agent data | Done |
| 05 | Reports, stack comparison, 89 features, API | Done |
| 06 | Product tiers, roadmap, BSP, growth path | Done |
| 07 | Voice input, Prefect, infrastructure | Done |
| 08 | Feature classification (73 deterministic, 13 LLM, 3 API) | Done |
| 09 | Catalog edge deployment, pre-dev checklist | Done |
| 10 | Workers architecture, billing, observability | Done |
| 11 | Standalone infrastructure (not shared) | Done |
| 12 | Production stack: 8 containers, 3 PostgreSQL, docker-compose | Done |
| 13 | UX inspiration and design principles (this doc) | Done |
| README | Product overview, stack, tiers, docs index | Done |

### What Follows: The Execution Sequence

**Day 1 — Decisions + Accounts**
- Decide: product name, domain
- Create: Cloudflare, Clerk, Resend, OpenAI, Groq, Photoroom, Google Cloud accounts
- Total: ~4 hours

**Day 2 — Server + Deployment**
- Provision Hetzner CX42 in Ashburn
- Install Dokploy
- Configure domain + DNS in Cloudflare
- Attach 100 GB block storage
- Total: ~3 hours

**Day 3 — Monorepo + Scaffolding**
- Initialize pnpm workspace + turborepo
- Scaffold: apps/api (Hono), apps/dashboard (Nuxt 3), apps/catalog (Nuxt 3 + CF Workers)
- Scaffold: packages/shared (types), packages/ui (components)
- Configure ESLint + Prettier + Vitest
- Total: ~6 hours

**Day 4 — Database + Auth**
- Write Drizzle schema (all MVP tables with RLS)
- Run migrations on pg-nova
- Integrate Clerk auth in Hono middleware
- Write RLS security tests
- Total: ~8 hours

**Day 5 — Deploy Pipeline**
- Create Dockerfiles for nova-api and nova-dashboard
- Configure Dokploy services
- Deploy catalog to Cloudflare Workers
- First end-to-end test
- Total: ~4 hours

**Day 6 — Start MVP Coding**
- Product CRUD + image upload to Cloudflare R2
- Photoroom API integration
- Begin catalog PWA (product listing, detail page)
- Total: coding begins, continues for 8 weeks

### Nothing Else Is Missing

13 documents define every aspect of the product: market, features, architecture, stack, infrastructure, costs, UX, and execution plan. The planning phase is complete. Day 1 is whenever you decide to start.
