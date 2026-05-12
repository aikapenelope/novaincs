# Nova — Addendum: Simplifications, Customer Identity, Database Sizing, Wakit Integration & MCP Migration Agent

> **Status**: Planning Phase  
> **Last Updated**: May 2026  
> **Scope**: Architecture simplifications (single-user tenancy), customer identification strategy, database growth projections, Wakit WhatsApp integration layer, content scope clarification, and MCP-based migration agent design.

---

## Table of Contents

1. [Architecture Simplification: Single-User Tenancy](#1-architecture-simplification-single-user-tenancy)
2. [Customer Identity: How We Know Who They Are](#2-customer-identity-how-we-know-who-they-are)
3. [Database Sizing & Growth Projections](#3-database-sizing--growth-projections)
4. [Content Creation Scope: Image Enhancement Only](#4-content-creation-scope-image-enhancement-only)
5. [Wakit Integration Layer](#5-wakit-integration-layer)
6. [MCP Migration Agent: Google Sheets Ingestion](#6-mcp-migration-agent-google-sheets-ingestion)
7. [Additional Value Opportunities](#7-additional-value-opportunities)

---

## 1. Architecture Simplification: Single-User Tenancy

### What Changes

The previous document (02-CRM-DATA-ARCHITECTURE.md) described a multi-user-per-tenant model with roles (owner, admin, member, viewer). Based on the decision to support **one merchant = one user**, the architecture simplifies significantly.

### What We Remove

- `tenant_members` table: eliminated entirely
- Role-based permission system: eliminated
- Multi-user session management: eliminated
- Team collaboration features: eliminated
- Per-user audit trails within a tenant: simplified to single-user activity log

### What We Keep

- **Multi-tenant isolation (RLS)**: Still critical. Each merchant's data is still isolated from every other merchant's data. The `tenant_id` column and Row-Level Security policies remain unchanged.
- **Clerk auth**: Still used, but simplified. One Clerk user = one tenant. No organization management needed.
- **The "viewer" concept**: Customers who visit the catalog are NOT users of the system. They are anonymous visitors tracked by behavioral events. They never authenticate. They only become "known" when they provide identity (checkout, WhatsApp message).

### Simplified Schema

```sql
-- Tenant = Merchant = User (1:1:1)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id VARCHAR(255) UNIQUE NOT NULL,  -- 1:1 with Clerk user
    name VARCHAR(255) NOT NULL,                   -- Business name
    slug VARCHAR(100) UNIQUE NOT NULL,            -- Public catalog URL
    phone VARCHAR(20),                            -- Merchant's WhatsApp number
    plan VARCHAR(50) DEFAULT 'free',
    status VARCHAR(50) DEFAULT 'active',
    settings JSONB DEFAULT '{}',
    onboarding_step VARCHAR(50) DEFAULT 'created',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- No tenant_members table. No roles. No permissions matrix.
-- Auth middleware: Clerk user -> tenant lookup -> set RLS context. Done.
```

### Impact on Robustness

Removing multi-user complexity has cascading benefits:

| Area | Before (multi-user) | After (single-user) | Robustness Gain |
|---|---|---|---|
| Auth flow | Clerk -> org lookup -> role check -> tenant context | Clerk -> tenant lookup -> done | Fewer failure points, faster requests |
| Data access | Check user permissions per resource | All resources accessible to tenant owner | No permission bugs possible |
| API surface | CRUD for members, roles, invitations | None | Smaller attack surface |
| Testing | Test every role x every resource combination | Test authenticated vs unauthenticated only | 80% fewer auth test cases |
| Onboarding | "Invite your team" step | Skip entirely | Faster time-to-value |
| Database | 1 extra table, 1 extra join per query | No extra table, no extra join | Simpler queries, better performance |

**Future-proofing**: If multi-user is ever needed (e.g., a merchant hires an employee), the `tenant_members` table can be added later without changing the core schema. The RLS policies already isolate by `tenant_id`, not by user. Adding users within a tenant is an additive change, not a breaking one.

---

## 2. Customer Identity: How We Know Who They Are

This is the most critical technical question for the CRM. The customer never "signs up" for Nova. They interact through the merchant's catalog (anonymous) or through WhatsApp (semi-identified). Nova must build a customer profile from these fragmented signals.

### 2.1 The Identity Resolution Problem

A single customer might interact through multiple channels:

```
Visit 1: Anonymous catalog visit (IP + device fingerprint only)
Visit 2: Another anonymous visit (same device, different day)
Visit 3: Adds to cart, enters phone number at checkout -> NOW IDENTIFIED
Visit 4: Sends WhatsApp message to merchant -> CONFIRMED IDENTITY
Visit 5: Returns to catalog (cookie matches phone from visit 3)
```

The challenge: visits 1 and 2 are anonymous. Visit 3 creates an identity. Visits 4 and 5 must be linked back to the same person. And visits 1-2 should retroactively be attributed to this person.

### 2.2 The Three Identity Layers

Nova uses three layers of identity, from weakest to strongest:

#### Layer 1: Anonymous Visitor (Device-Level)

**How it works**: When someone visits the catalog PWA, Nova generates a `visitor_id` (UUID stored in localStorage + a first-party cookie). This tracks the device, not the person.

**What we capture**:
- `visitor_id` (UUID, persistent per device)
- Device type (mobile/desktop, from User-Agent)
- Approximate location (from IP, city-level only)
- All behavioral events (page views, product views, cart actions)
- Referral source (Instagram, WhatsApp shared link, direct, etc.)

**Limitations**: If the same person uses two devices, they appear as two visitors. If two people share a device, they appear as one visitor. This is acceptable — the goal is not perfect identity, it's "good enough to be useful."

#### Layer 2: Identified Contact (Checkout or WhatsApp)

**How it works**: The customer provides identity through one of two paths:

**Path A — Checkout form**: When the customer proceeds to checkout (before payment), they enter:
- Name (required)
- Phone number (required — this is the primary key for identity in Venezuela)
- Delivery zone (optional, for delivery-based businesses)

That's it. Three fields maximum. No email (most Venezuelan micro-commerce customers don't use email for transactions). No account creation. No password.

**Path B — WhatsApp message**: When a customer sends a WhatsApp message to the merchant (via the "Negotiate on WhatsApp" button or directly), the WhatsApp Cloud API webhook provides:
- Phone number (the primary identifier) — **but see BSUID note below**
- WhatsApp display name (often a first name or nickname)
- BSUID (Business Scoped User ID) — new as of June 2026

**Critical: WhatsApp BSUID Change (June 2026)**

Starting June 2026, WhatsApp is rolling out usernames. Customers can message businesses without sharing their phone number. When this happens, Nova receives a BSUID instead of a phone number.

Nova's identity model must support both:

```sql
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Primary identifiers (at least one must exist)
    phone VARCHAR(20),              -- E.164 format, nullable (BSUID-only customers)
    whatsapp_bsuid VARCHAR(128),    -- WhatsApp Business Scoped User ID, nullable

    -- Profile (auto-populated + editable)
    name VARCHAR(255),              -- From checkout form or WhatsApp display name
    delivery_zone VARCHAR(255),
    preferred_payment VARCHAR(50),  -- Auto-detected from order history
    notes TEXT,                     -- Merchant's manual notes
    custom_tags TEXT[],             -- Merchant-defined labels

    -- Computed fields (updated by background jobs)
    rfm_recency INTEGER DEFAULT 0,
    rfm_frequency INTEGER DEFAULT 0,
    rfm_monetary DECIMAL(12,2) DEFAULT 0,
    rfm_score VARCHAR(3),           -- e.g., "555", "312"
    segment VARCHAR(50),            -- "vip", "at_risk", "new", etc.
    lifetime_value DECIMAL(12,2) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    last_purchase_at TIMESTAMPTZ,
    last_visit_at TIMESTAMPTZ,

    -- Identity linking
    visitor_ids TEXT[],             -- Array of visitor_id UUIDs linked to this customer

    -- Metadata
    first_seen_source VARCHAR(50), -- "checkout", "whatsapp", "import"
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Constraints
    CONSTRAINT unique_phone_per_tenant UNIQUE (tenant_id, phone),
    CONSTRAINT unique_bsuid_per_tenant UNIQUE (tenant_id, whatsapp_bsuid),
    CONSTRAINT at_least_one_identifier CHECK (phone IS NOT NULL OR whatsapp_bsuid IS NOT NULL)
);

CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_phone ON customers(tenant_id, phone);
CREATE INDEX idx_customers_bsuid ON customers(tenant_id, whatsapp_bsuid);
```

#### Layer 3: Merged Identity (Cross-Channel)

**How it works**: When a customer who was previously anonymous (Layer 1) provides identity (Layer 2), Nova merges the records:

1. Customer visits catalog anonymously (visitor_id = `abc123`)
2. Customer checks out, provides phone `+584141234567`
3. Nova creates a customer record with phone `+584141234567`
4. Nova links `visitor_id = abc123` to this customer (adds to `visitor_ids` array)
5. All previous anonymous events for `abc123` are now attributed to this customer
6. Future visits from the same device are automatically attributed

**Merge logic for WhatsApp BSUID**:
- If a WhatsApp message arrives with both phone AND BSUID: store both, link to existing customer by phone if exists
- If a WhatsApp message arrives with BSUID only (no phone): create customer with BSUID only
- If the same person later provides phone (e.g., at checkout): merge BSUID-only record with phone-based record
- BSUID is scoped per business portfolio, so it's unique per merchant — perfect for our multi-tenant model

### 2.3 Meta Pixel / Conversions API Integration

For merchants who run Meta (Facebook/Instagram) ads, Nova can integrate with Meta's tracking:

**Meta Pixel** (client-side): Installed on the catalog PWA. Fires standard events:
- `PageView` — every catalog page
- `ViewContent` — product detail page
- `AddToCart` — cart addition
- `InitiateCheckout` — checkout start
- `Purchase` — order completion

**Conversions API (CAPI)** (server-side): Nova's backend sends the same events server-to-server to Meta, with hashed customer identifiers (phone, name). This is critical because:
- Pixel-only setups now miss 30-60% of conversions (iOS/Safari blocking)
- CAPI provides the resilience layer
- Meta can match Nova's customers with Meta ad viewers, enabling attribution

**What this gives the merchant**: "You spent $10 on Instagram ads. 3 people who saw your ad visited your catalog. 1 of them bought $45 worth of products. Your ROAS is 4.5x."

This is extremely high-value intelligence that no competitor in the Venezuelan market currently offers.

**Implementation**: The Meta Pixel is a simple script tag in the catalog PWA. The Conversions API is a server-side HTTP POST from Nova's backend to Meta's API. Both use the merchant's Meta Pixel ID (configured in Nova settings). The merchant gets this from their Meta Business Suite — it's a single ID they paste into Nova.

### 2.4 Identity Without WhatsApp Access

A key clarification: **Nova does NOT read WhatsApp message content**. Nova receives structured webhook events from the WhatsApp Cloud API:

| What Nova Receives | What Nova Does NOT Receive |
|---|---|
| Phone number or BSUID of sender | Message text content (unless using Wakit layer) |
| Timestamp of message | Photos or media sent by customer |
| Message type (text, image, etc.) | Conversation history |
| Delivery/read receipts | |

For the MVP (without Wakit), Nova knows:
- "A customer with phone X sent a message at time Y"
- "The merchant read it at time Z"
- "The customer sent 5 messages this week"

This is enough for the CRM to track engagement frequency. The actual conversation content lives in WhatsApp (or in Wakit, when integrated — see Section 5).

---

## 3. Database Sizing & Growth Projections

### 3.1 Per-Merchant Data Volume Estimation

For a typical merchant with moderate activity:

| Table | Rows/Month | Row Size (avg) | Monthly Growth | Notes |
|---|---|---|---|---|
| `products` | 5-10 new | ~500 bytes | ~5 KB | Most merchants have 50-200 products total |
| `customers` | 20-50 new | ~400 bytes | ~20 KB | Grows as new people interact |
| `customer_events` | 2,000-5,000 | ~200 bytes | ~1 MB | This is the big one: page views, cart events, etc. |
| `orders` | 50-200 | ~300 bytes | ~60 KB | |
| `order_items` | 100-500 | ~150 bytes | ~75 KB | |
| `payments` | 50-200 | ~250 bytes | ~50 KB | |
| `inventory_movements` | 100-400 | ~150 bytes | ~60 KB | |
| `images` (metadata) | 10-30 | ~200 bytes | ~6 KB | Actual images in Cloudflare R2, not PostgreSQL |
| `agent_actions` | 100-300 | ~300 bytes | ~90 KB | AI agent suggestions and executions |
| **TOTAL per merchant** | | | **~1.4 MB/month** | |

### 3.2 Platform-Level Projections

| Scale | Merchants | Monthly DB Growth | Annual DB Growth | Total After 2 Years |
|---|---|---|---|---|
| **Launch** (Month 1-6) | 100-500 | 0.7 GB | ~4 GB | ~4 GB |
| **Growth** (Month 7-12) | 500-5,000 | 7 GB | ~42 GB | ~46 GB |
| **Scale** (Year 2) | 5,000-25,000 | 35 GB | ~420 GB | ~466 GB |
| **Target** (Year 3) | 25,000-100,000 | 140 GB | ~1.7 TB | ~2.2 TB |

### 3.3 The Big Table: `customer_events`

`customer_events` will be 80-90% of total database size. This is the behavioral tracking table.

**At 25,000 merchants**: ~125M events/month, ~1.5B events/year.

**Mitigation strategies**:

1. **Table partitioning by month**: PostgreSQL native partitioning. Each month is a separate physical partition. Old partitions can be archived or dropped.

```sql
CREATE TABLE customer_events (
    id UUID DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    customer_id UUID,
    visitor_id UUID,
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE customer_events_2026_05 PARTITION OF customer_events
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE customer_events_2026_06 PARTITION OF customer_events
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
-- ... auto-created by a cron job
```

2. **Retention policy**: Keep detailed events for 90 days. After 90 days, aggregate into daily summaries and drop raw events. The CRM only needs "Maria visited 5 times last Tuesday" not "Maria visited at 10:03, 10:15, 10:22, 14:30, 16:45."

3. **ClickHouse for analytics (Phase 3+)**: Move historical event data to ClickHouse for analytical queries. ClickHouse compresses columnar data 10-20x, so 1TB of PostgreSQL events becomes ~50-100GB in ClickHouse.

### 3.4 Storage Costs

| Component | Size at 25K Merchants | Monthly Cost (Hetzner) |
|---|---|---|
| PostgreSQL (hot data, 90 days) | ~100 GB | Included in dedicated server |
| PostgreSQL (archived) | ~400 GB | ~$15/mo (volume storage) |
| Cloudflare R2 (images) | ~500 GB (avg 100 images/merchant x 1MB) | ~$15/mo (volume storage) |
| Redis | ~2 GB (cache + queues) | Included in dedicated server |
| ClickHouse (Phase 3+) | ~50 GB (compressed analytics) | ~$5/mo (volume storage) |
| **Total** | ~1 TB | **~$35/mo additional storage** |

PostgreSQL handles this scale comfortably. The rule of thumb: don't worry about schema optimization below 100GB. Between 100GB and 1TB, partition the big tables (which we're already doing). Above 1TB, consider sharding (Citus) or offloading analytics to ClickHouse.

---

## 4. Content Creation Scope: Image Enhancement Only

### What Nova Does

Nova's content creation is focused exclusively on **product image enhancement**:

- Background removal (messy counter -> clean white/studio background)
- Lighting and color correction
- Product staging in lifestyle scenes
- Batch processing of multiple photos

### What Nova Does NOT Do (In This Phase)

- Social media post creation/scheduling (future, via integrations)
- Video creation
- Blog/SEO content writing
- Ad creative generation

### Why This Scope

The merchant's immediate pain is "my photos look cheap." Solving that one problem with AI image enhancement delivers immediate, visible value. Everything else (social media management, content calendars, ad creation) is a different product category with different competitors (Buffer, Later, Canva) and can be integrated later via MCP or APIs.

The catalog with enhanced images IS the content. When the merchant shares their Nova catalog link on Instagram or WhatsApp, the professional-looking product photos are the marketing content.

---

## 5. Wakit Integration Layer

### What Wakit Is

[Wakit](https://github.com/matiasbattocchia/wakit-api) is an open-source WhatsApp Business Platform built with Deno and Supabase. It provides:

- Multi-tenant WhatsApp account management
- Message storage and conversation history
- Webhook-based event system
- MCP server for AI agent access
- AI agent integration (lightweight built-in + external via a2a/chat-completions)
- Media processing (audio, images, video, PDF)

### How Wakit Fits Into Nova

Wakit sits as an **optional integration layer** between Nova and WhatsApp:

```
WITHOUT WAKIT (MVP):
Customer <-> WhatsApp <-> WhatsApp Cloud API <-> Nova (webhooks only)
                                                  (phone/BSUID, timestamps, no content)

WITH WAKIT (Phase 2+):
Customer <-> WhatsApp <-> Wakit API <-> Nova (full conversation data)
                                         (messages, media, conversation history)
                                         + Wakit MCP Server <-> Nova Agents
```

### What Wakit Enables That Raw WhatsApp API Doesn't

| Capability | Without Wakit | With Wakit |
|---|---|---|
| Know who messaged | Yes (phone/BSUID) | Yes |
| Know message content | No | Yes (stored in Wakit DB) |
| Conversation history | No | Yes (full thread) |
| AI agent replies | No (merchant replies manually) | Yes (agents can read context and draft/send replies) |
| Media processing | No | Yes (extract info from photos, PDFs) |
| Match conversations to CRM | Partial (phone only) | Full (conversation context + CRM data) |
| Sentiment analysis | No | Yes (analyze message tone) |

### Architecture Decision: Adapted, Not Connected

The key insight from your question: **the system should be designed to work with Wakit, but not connected yet**. This means:

1. Nova's customer schema already has `whatsapp_bsuid` field (ready for Wakit's identity model)
2. Nova's event system already has event types for WhatsApp interactions (ready to receive richer events from Wakit)
3. Nova's agent system already has MCP tool definitions for WhatsApp operations (ready to connect to Wakit's MCP server)
4. The actual connection is per-merchant configuration (each merchant connects their own WhatsApp number through Wakit)

```typescript
// Nova's agent can already define Wakit tools — they just aren't connected yet
const salesAgent = new Agent({
  name: "Sales Agent",
  tools: [
    // These tools are defined but will return "not configured" until Wakit is connected
    MCPTool({ server: "wakit-mcp", tool: "fetch_conversation" }),
    MCPTool({ server: "wakit-mcp", tool: "send_message" }),
    MCPTool({ server: "wakit-mcp", tool: "search_contacts" }),
  ],
  instructions: "When Wakit is connected, use conversation context to personalize outreach",
});
```

### Per-Merchant Wakit Connection

When a merchant is ready to connect WhatsApp fully:

1. Merchant signs up for Wakit (self-hosted or managed at app.wakit.ai)
2. Merchant connects their WhatsApp Business number via Embedded Signup
3. Merchant provides their Wakit API key to Nova
4. Nova configures the MCP connection to that merchant's Wakit instance
5. From that point: full conversation data flows into Nova's CRM

This is a **per-merchant opt-in**, not a platform-wide dependency. Some merchants may never connect Wakit (they use WhatsApp manually). Others may connect it immediately. Nova works either way.

---

## 6. MCP Migration Agent: Google Sheets Ingestion

### The Vision

You described it precisely: a **proprietary MCP server** that connects to an Agno agent, which handles the entire migration pipeline. The merchant shares their Google Sheet, and the agent does the rest.

### Architecture

```
Merchant's Google Sheet
        │
        ▼
Nova MCP Server (proprietary)
  ├── google-sheets-reader tool (reads spreadsheet data)
  ├── column-mapper tool (AI-powered column detection)
  ├── data-validator tool (clean, deduplicate, normalize)
  ├── staging-writer tool (write to staging tables)
  └── production-promoter tool (atomic move to production)
        │
        ▼
Agno Migration Agent
  ├── Reads the spreadsheet via MCP tools
  ├── Detects column meanings using LLM
  ├── Validates and cleans each row
  ├── Presents summary to merchant for approval
  ├── Imports approved data atomically
  └── Reports results
```

### The MCP Server Design

Nova builds ONE proprietary MCP server that exposes all data ingestion tools:

```typescript
// Nova's proprietary MCP server — handles all import sources
const novaMigrationMCP = new MCPServer({
  name: "nova-migration",
  tools: [
    // Google Sheets tools
    {
      name: "read_google_sheet",
      description: "Read data from a Google Sheet by URL or ID",
      inputSchema: {
        url: { type: "string", description: "Google Sheets URL or ID" },
        sheet_name: { type: "string", description: "Sheet tab name (optional)" },
        range: { type: "string", description: "Cell range like A1:Z100 (optional)" },
      },
    },
    // Excel/CSV tools
    {
      name: "parse_uploaded_file",
      description: "Parse an uploaded Excel or CSV file",
      inputSchema: {
        file_id: { type: "string", description: "ID of uploaded file in Cloudflare R2" },
        format: { type: "string", enum: ["xlsx", "csv", "tsv"] },
      },
    },
    // Column mapping tools
    {
      name: "detect_column_mapping",
      description: "Use AI to detect what each column represents",
      inputSchema: {
        headers: { type: "array", items: { type: "string" } },
        sample_rows: { type: "array", description: "First 5 rows of data" },
        target_entity: { type: "string", enum: ["products", "customers"] },
      },
    },
    // Validation tools
    {
      name: "validate_import_data",
      description: "Validate and clean data before import",
      inputSchema: {
        data: { type: "array", description: "Array of mapped rows" },
        entity_type: { type: "string", enum: ["products", "customers"] },
        tenant_id: { type: "string" },
      },
    },
    // Import tools
    {
      name: "stage_import",
      description: "Write validated data to staging tables",
      inputSchema: {
        validated_data: { type: "array" },
        entity_type: { type: "string" },
        tenant_id: { type: "string" },
      },
    },
    {
      name: "promote_to_production",
      description: "Move staged data to production tables (atomic)",
      inputSchema: {
        staging_job_id: { type: "string" },
        tenant_id: { type: "string" },
      },
    },
  ],
});
```

### The Migration Agent

```python
# Agno Migration Agent definition
migration_agent = Agent(
    name="Migration Agent",
    model="claude:sonnet-4",
    tools=[
        MCPTool(server="nova-migration", tool="read_google_sheet"),
        MCPTool(server="nova-migration", tool="parse_uploaded_file"),
        MCPTool(server="nova-migration", tool="detect_column_mapping"),
        MCPTool(server="nova-migration", tool="validate_import_data"),
        MCPTool(server="nova-migration", tool="stage_import"),
        MCPTool(server="nova-migration", tool="promote_to_production"),
    ],
    instructions="""
    You are the Migration Agent for Nova. Your job is to help merchants
    import their existing data (products, customers, inventory) from
    external sources like Google Sheets and Excel files.

    Follow this process:
    1. Read the source data using the appropriate tool
    2. Detect column mappings using AI
    3. Present the mapping to the merchant for confirmation
    4. Validate and clean the data (fix formats, detect duplicates)
    5. Present a summary of what will be imported and any issues found
    6. On merchant approval, stage the data
    7. Promote to production atomically
    8. Report results

    Always be conservative: if unsure about a mapping or a data quality
    issue, ask the merchant rather than guessing.

    Handle these common Venezuelan data patterns:
    - Phone numbers in format 0414-1234567 -> normalize to +584141234567
    - Prices with comma as decimal separator (45,00 -> 45.00)
    - Prices with "Bs" or "$" prefix -> strip and categorize
    - Names in ALL CAPS -> convert to Title Case
    - Duplicate products with slight name variations -> suggest merge
    """,
    enable_memories=True,
    db=Postgres(connection_string),
)
```

### The Flow From the Merchant's Perspective

```
Merchant: "Quiero importar mis productos desde Google Sheets"

Agent: "Perfecto. Comparteme el link de tu Google Sheet."

Merchant: [pastes Google Sheets URL]

Agent: "Ya lo lei. Encontre 47 filas con estas columnas:
        - Producto -> Nombre del producto ✓
        - Precio -> Precio en USD ✓
        - Stock -> Cantidad en inventario ✓
        - Foto -> URL de imagen ✓
        - 'Notas' -> No se a que corresponde. ¿Quieres que lo importe
          como descripcion del producto o lo ignoro?"

Merchant: "Ponlo como descripcion"

Agent: "Listo. Revise los datos y encontre:
        - 42 productos listos para importar
        - 3 productos duplicados (mismo nombre, diferente precio)
        - 2 productos sin precio
        ¿Quieres que te muestre los duplicados para que decidas?"

Merchant: "Si"

Agent: [shows duplicates with merge options]

Merchant: [resolves each one]

Agent: "Todo listo. Voy a importar 47 productos. ¿Confirmas?"

Merchant: "Si"

Agent: "Importados 47 productos. Ya estan en tu catalogo.
        Quieres que mejore las fotos con IA? Encontre 32 productos
        con imagenes que puedo mejorar."
```

This is a **conversational migration**, not a form-based wizard. The agent handles the complexity. The merchant just answers questions.

---

## 7. Additional Value Opportunities

### 7.1 Things That Can Still Add Value

After thorough analysis, here are opportunities not yet covered that would strengthen the product:

#### Opportunity 1: "Comparador de Precios" (Price Benchmarking)

If multiple Nova merchants sell similar products (e.g., Nike shoes), the system can anonymously aggregate pricing data and show each merchant where they stand:

```
Tu precio: $45
Promedio en Nova: $42
Rango: $38 - $52
Sugerencia: Tu precio esta ligeramente por encima del promedio.
            Considera un descuento del 5% para ser mas competitivo.
```

This is a **network effect feature**: the more merchants on Nova, the more valuable the pricing intelligence becomes. No individual merchant's data is exposed — only aggregates.

#### Opportunity 2: "Recomendador de Productos" (Cross-Merchant Recommendations)

When a customer visits Merchant A's catalog and views shoes, Nova could (with merchant opt-in) show: "Tambien te puede interesar..." with products from Merchant B (a complementary business, not a competitor).

This creates a **marketplace effect** without building a marketplace. Each merchant keeps their own catalog, but customers discover related products across the network.

#### Opportunity 3: "Historial de Tasa" (Exchange Rate History + Impact)

Given Venezuela's bimonetary economy, a feature that shows:
- Historical exchange rate chart (BCV + parallel)
- Impact on the merchant's margins over time
- Automatic alerts when rate changes affect profitability
- One-tap mass price update with preview

This is unique to the Venezuelan market and no competitor offers it.

#### Opportunity 4: "Modo Feria" (Event/Pop-Up Mode)

Many Venezuelan merchants sell at ferias (pop-up markets, bazaars). A special mode that:
- Generates a QR code for the physical booth
- Customers scan -> see catalog on their phone
- Quick checkout optimized for in-person (no delivery needed)
- Track which products got the most scans at the feria

#### Opportunity 5: "Reporte para el Contador" (Accountant Export)

Venezuelan merchants need to report to their accountant monthly. A one-tap export that generates:
- Monthly income summary
- Expense summary (if tracked)
- Tax-relevant transaction list
- Formatted for Venezuelan accounting standards

This saves the merchant 2-3 hours of manual compilation per month and makes their accountant happy (which means the accountant recommends Nova to other clients — organic growth channel).

### 7.2 Assessment: Is the System Complete?

The system as designed across all three documents covers:

- **Acquisition**: Catalog + Image AI + WhatsApp checkout (how merchants get customers)
- **Conversion**: Pago Movil/Zelle + OCR verification (how customers pay)
- **Retention**: CRM + RFM + AI agents + automated outreach (how merchants keep customers)
- **Intelligence**: 5 proactive loops + financial dashboard (how merchants make decisions)
- **Operations**: Inventory + delivery zones (how merchants fulfill orders)
- **Growth**: Content generation + Meta Pixel + campaigns (how merchants scale)
- **Migration**: MCP agent + Google Sheets + Excel (how merchants onboard)
- **Integration**: Wakit + MCP + public API (how the system connects to everything else)

The only major category NOT covered is **team/HR management** (employee scheduling, payroll, etc.), which is intentionally out of scope — that's a different product category.

**Verdict**: The system is comprehensive for its target market. The additional opportunities in 7.1 are "nice to have" features that can be added post-launch based on merchant feedback. The core is solid.
