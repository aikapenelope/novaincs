# Nova — Feature Classification: Deterministic vs LLM, Cost Model & Pre-Development Checklist

> **Status**: Planning Phase  
> **Last Updated**: May 2026  
> **Scope**: Classification of all 89 features by execution type (deterministic code vs LLM-powered), LLM model selection and cost per feature, and complete pre-development checklist of what remains to define before writing code.

---

## Table of Contents

1. [Feature Classification: Deterministic vs LLM](#1-feature-classification-deterministic-vs-llm)
2. [LLM Model Selection & Cost Per Feature](#2-llm-model-selection--cost-per-feature)
3. [Monthly LLM Cost Projection](#3-monthly-llm-cost-projection)
4. [What Still Needs to Be Defined Before Coding](#4-what-still-needs-to-be-defined-before-coding)

---

## 1. Feature Classification: Deterministic vs LLM

Every feature falls into one of three categories:

- **Deterministic**: Pure code. SQL queries, math, CRUD operations, UI rendering. Zero AI cost. Predictable, testable, instant.
- **LLM-Powered**: Requires a language model call. Variable cost per invocation. Needs prompt engineering, guardrails, and fallback handling.
- **External API**: Calls a third-party service that isn't an LLM (Photoroom for images, Resend for email, Meta for WhatsApp). Has its own pricing.

### 1.1 Catalog & Products

| # | Feature | Type | Model/Service | Notes |
|---|---|---|---|---|
| C1 | Create product (CRUD) | **Deterministic** | — | Drizzle ORM insert |
| C2 | Product variants | **Deterministic** | — | Relational schema, no AI |
| C3 | Dual pricing (USD + Bs) | **Deterministic** | — | Math: price_bs = price_usd * rate. Rate from external API (BCV) |
| C4 | Product images (upload) | **Deterministic** | — | File upload to Cloudflare R2 (S3-compatible) |
| C5 | AI image enhancement | **External API** | Photoroom API | $0.02/image |
| C6 | Public catalog PWA | **Deterministic** | — | Nuxt SSR, no AI |
| C7 | Catalog SEO | **Deterministic** | — | Meta tags generated from product data, template-based |
| C8 | Product search (text) | **Deterministic** | — | PostgreSQL full-text search (`tsvector`) |
| C9 | Categories/subcategories | **Deterministic** | — | Relational schema |
| C10 | Bulk import Excel/CSV | **Deterministic** | — | File parsing (SheetJS), validation, DB insert |
| C11 | Google Sheets import (MCP) | **LLM** | GPT-5 Mini | Column detection/mapping. ~300 tokens per import |
| C12 | Semantic search (pgvector) | **LLM** (one-time) | GPT-5 Mini | Embedding generation on product create/update. ~100 tokens per product. Search itself is deterministic (vector similarity) |
| C13 | QR code per product | **Deterministic** | — | QR generation library (qrcode.js) |
| C14 | Modo Vitrina image | **External API** | Photoroom API | Same as C5, different template |

**Summary**: 11 deterministic, 2 LLM, 2 external API. The catalog is almost entirely deterministic.

### 1.2 Checkout & Payments

| # | Feature | Type | Model/Service | Notes |
|---|---|---|---|---|
| P1 | Shopping cart | **Deterministic** | — | Client-side state (localStorage + API) |
| P2 | Cart detail | **Deterministic** | — | UI component |
| P3 | Buyer info form | **Deterministic** | — | Form + validation |
| P4 | Delivery/pickup selection | **Deterministic** | — | UI toggle |
| P5 | Pago Movil flow | **Deterministic** | — | Display data + clipboard copy |
| P6 | Zelle flow | **Deterministic** | — | Display data + reference field |
| P7 | Cash on delivery | **Deterministic** | — | Status flag on order |
| P8 | Screenshot upload | **Deterministic** | — | File upload to Cloudflare R2 (S3-compatible) |
| P9 | OCR auto-verification | **LLM** | GPT-5 Mini (vision) | Image → extract amount, reference, bank. ~500 tokens per screenshot |
| P10 | Unique payment link | **Deterministic** | — | UUID route, no AI |
| P11 | WhatsApp deep link | **Deterministic** | — | URL construction with encoded text |
| P12 | Returning customer auto-fill | **Deterministic** | — | Cookie lookup → DB query |
| P13 | Browser geolocation | **Deterministic** | — | Navigator.geolocation API |
| P14 | Stock reservation | **Deterministic** | — | DB transaction with TTL |
| P15 | Exchange rate auto-update | **Deterministic** | — | HTTP fetch from BCV API → DB update |
| P16 | Mass price update | **Deterministic** | — | SQL: UPDATE products SET price_bs = price_usd * new_rate |

**Summary**: 15 deterministic, 1 LLM. Checkout is almost 100% deterministic. Only OCR uses AI.

### 1.3 Micro-CRM

| # | Feature | Type | Model/Service | Notes |
|---|---|---|---|---|
| R1 | Auto-populated profiles | **Deterministic** | — | INSERT/UPDATE on order creation |
| R2 | Customer list + search | **Deterministic** | — | SQL query with filters |
| R3 | Customer detail card | **Deterministic** | — | SQL joins, computed fields |
| R4 | Manual notes | **Deterministic** | — | Text field, CRUD |
| R5 | Custom tags | **Deterministic** | — | Array field, CRUD |
| R6 | RFM scoring | **Deterministic** | — | SQL aggregation: recency = days since last order, frequency = count orders in 90d, monetary = sum in 90d. Pure math. |
| R7 | Auto-segments | **Deterministic** | — | IF/THEN rules on RFM scores. No AI needed. |
| R8 | Customer timeline | **Deterministic** | — | SELECT from events table, ordered by date |
| R9 | Behavioral tracking | **Deterministic** | — | Beacon API → Redis Stream → PostgreSQL |
| R10 | Cart abandonment detection | **Deterministic** | — | Timer: if cart_created > 2h ago AND no order → flag |
| R11 | Identity merge | **Deterministic** | — | Match by phone/BSUID, update visitor_ids array |
| R12 | WhatsApp BSUID support | **Deterministic** | — | Schema field + matching logic |
| R13 | Meta Pixel | **Deterministic** | — | JavaScript snippet injection |
| R14 | Meta Conversions API | **Deterministic** | — | Server-side HTTP POST to Meta |

**Summary**: 14 deterministic, 0 LLM. The entire CRM is deterministic. RFM scoring, segmentation, behavioral tracking — all pure math and SQL.

### 1.4 Inventory

| # | Feature | Type | Model/Service | Notes |
|---|---|---|---|---|
| I1 | Stock per product | **Deterministic** | — | Integer field |
| I2 | Swipe adjustment | **Deterministic** | — | UI + DB update |
| I3 | Low stock alerts | **Deterministic** | — | IF stock < threshold → push notification |
| I4 | Movement history | **Deterministic** | — | Append-only log table |
| I5 | Unit cost + margin | **Deterministic** | — | margin = (price - cost) / price. Math. |
| I6 | Barcode scanning | **Deterministic** | — | Camera API + barcode library (quagga2) |
| I7 | Inventory valuation | **Deterministic** | — | SUM(stock * cost) per product |

**Summary**: 7 deterministic, 0 LLM.

### 1.5 Orders & Sales

| # | Feature | Type | Model/Service | Notes |
|---|---|---|---|---|
| O1 | Order list | **Deterministic** | — | SQL query with filters |
| O2 | Order detail | **Deterministic** | — | SQL joins |
| O3 | Mark as paid | **Deterministic** | — | Status update + inventory adjustment |
| O4 | Mark as shipped | **Deterministic** | — | Status update |
| O5 | Daily sales total | **Deterministic** | — | SUM(amount) WHERE date = today |
| O6 | Weekly summary | **Deterministic** | — | SQL aggregation + email template |
| O7 | Monthly report | **LLM** (partial) | GPT-5 Mini | The data is deterministic (SQL). The "Recommendations" section at the bottom uses LLM. ~500 tokens per report. |
| O8 | Quarterly review | **LLM** (partial) | GPT-5 Mini | Same as O7, larger context. ~800 tokens. |
| O9 | Accounts receivable | **Deterministic** | — | SQL: orders WHERE status = 'pending_payment' |
| O10 | Payment reminders | **LLM** | GPT-5 Mini | Generate personalized reminder message. ~200 tokens. |
| O11 | PDF/Excel export | **Deterministic** | — | Data serialization, no AI |

**Summary**: 8 deterministic, 3 LLM (partial — only the text generation part, not the data).

### 1.6 Financial Dashboard

| # | Feature | Type | Model/Service | Notes |
|---|---|---|---|---|
| F1 | Income view | **Deterministic** | — | SQL aggregation |
| F2 | Margin per product | **Deterministic** | — | Math |
| F3 | Cash flow | **Deterministic** | — | Inflows - outflows |
| F4 | Top products | **Deterministic** | — | SQL ORDER BY revenue DESC |
| F5 | Top customers | **Deterministic** | — | SQL ORDER BY lifetime_value DESC |
| F6 | Period comparison | **Deterministic** | — | Two SQL queries, diff |
| F7 | Revenue projection | **Deterministic** | — | Linear regression on last 30 days. Math, not AI. |
| F8 | Payment method distribution | **Deterministic** | — | SQL GROUP BY payment_method |
| F9 | Exchange rate impact | **Deterministic** | — | Math: old_rate vs new_rate applied to product prices |

**Summary**: 9 deterministic, 0 LLM. The entire financial dashboard is pure math and SQL.

### 1.7 Messaging & WhatsApp

| # | Feature | Type | Model/Service | Notes |
|---|---|---|---|---|
| M1 | WhatsApp deep link | **Deterministic** | — | URL construction |
| M2 | Order notification | **Deterministic** | — | Push notification via web push API |
| M3 | WhatsApp Business API | **Deterministic** | — | HTTP calls to Meta Graph API |
| M4 | Broadcast by segment | **Deterministic** | — | Query segment → send template to each. Template is pre-written. |
| M5 | Welcome message | **Deterministic** | — | Pre-written template, triggered on first order |
| M6 | Abandoned cart recovery | **LLM** | GPT-5 Mini | Personalized message with product names and incentive. ~200 tokens. |
| M7 | Post-sale follow-up | **LLM** | GPT-5 Mini | Personalized thank-you with product recommendations. ~200 tokens. |
| M8 | Wakit integration | **Deterministic** | — | MCP connection, webhook routing |

**Summary**: 6 deterministic, 2 LLM.

### 1.8 AI & Agents

| # | Feature | Type | Model/Service | Notes |
|---|---|---|---|---|
| A1 | AI image enhancement | **External API** | Photoroom | $0.02/image |
| A2 | Daily briefing | **LLM** | GPT-5 Mini | Summarize day's data into natural language. ~500 tokens. |
| A3 | Smart feed suggestions | **LLM** | GPT-5 Mini | Generate 3-5 actionable suggestions from data patterns. ~400 tokens per refresh. |
| A4 | Sales Agent | **LLM** | GPT-5 Mini | Analyze customer behavior, suggest actions. ~300 tokens per suggestion. |
| A5 | Finance Agent (OCR) | **LLM** | GPT-5 Mini (vision) | OCR + financial summary. ~500 tokens. |
| A6 | Content Agent | **LLM** | GPT-5 Mini | Product descriptions, social media copy. ~300 tokens per generation. |
| A7 | Support Agent (Q&A) | **LLM** | GPT-5 Mini | Answer merchant questions about their data. ~400 tokens per question. |
| A8 | AI autonomous mode | **LLM** | GPT-5 Mini | Same agents, but execute without confirmation. Same token cost. |
| A9 | Voice commands | **External API** | Groq Whisper | Transcription: ~$0.001/minute. Then GPT-5 Mini for parsing: ~200 tokens. |

**Summary**: 0 deterministic, 7 LLM, 2 external API. This is the only module that's majority LLM.

### 1.9 Integrations

| # | Feature | Type | Model/Service | Notes |
|---|---|---|---|---|
| X1 | Excel/CSV import | **Deterministic** | — | SheetJS parsing |
| X2 | Excel/CSV export | **Deterministic** | — | Data serialization |
| X3 | Google Sheets import | **LLM** | GPT-5 Mini | Column mapping. ~300 tokens per import. |
| X4 | Google Sheets sync | **Deterministic** | — | Google Sheets API (service account), no AI for sync |
| X5 | Meta Pixel | **Deterministic** | — | Script injection |
| X6 | Meta Conversions API | **Deterministic** | — | Server-side HTTP POST |
| X7 | Exchange rate API | **Deterministic** | — | HTTP fetch |
| X8 | Webhooks | **Deterministic** | — | HTTP POST on events |
| X9 | Public REST API | **Deterministic** | — | Hono routes |
| X10 | MCP Server | **Deterministic** | — | MCP protocol implementation |
| X11 | Wakit integration | **Deterministic** | — | MCP connection |

**Summary**: 10 deterministic, 1 LLM.

### 1.10 Platform & Settings

| # | Feature | Type | Model/Service | Notes |
|---|---|---|---|---|
| S1 | Onboarding wizard | **Deterministic** | — | Step-by-step UI |
| S2 | Store settings | **Deterministic** | — | CRUD |
| S3 | Payment config | **Deterministic** | — | CRUD |
| S4 | Delivery zones | **Deterministic** | — | CRUD + map component |
| S5 | Notification preferences | **Deterministic** | — | CRUD |
| S6 | Email report preferences | **Deterministic** | — | CRUD |
| S7 | Plan management | **Deterministic** | — | Stripe/local billing integration |
| S8 | Data export | **Deterministic** | — | SQL → CSV/JSON serialization |

**Summary**: 8 deterministic, 0 LLM.

---

## 2. LLM Model Selection & Cost Per Feature

### 2.1 The Model Strategy: Three Tiers

| Tier | Model | Input $/1M tokens | Output $/1M tokens | Use Case |
|---|---|---|---|---|
| **Cheap & Fast** | Groq Llama 4 Scout | $0.11 | $0.34 | Voice transcription parsing, simple classification, intent detection |
| **Workhorse** | GPT-5 Mini | $0.25 | $2.00 | All agent tasks: briefings, suggestions, OCR, content generation, Q&A |
| **Reasoning** | Claude Sonnet 4 | $3.00 | $15.00 | Complex analysis only (quarterly reviews, migration conflict resolution). Rarely used. |

**Why GPT-5 Mini as the workhorse (not Claude Haiku)?**

| Model | Input $/1M | Output $/1M | Vision | Speed | Quality |
|---|---|---|---|---|---|
| GPT-5 Mini | $0.25 | $2.00 | Yes | Fast | Very good for structured tasks |
| Claude Haiku 4.5 | $1.00 | $5.00 | Yes | Fast | Good |
| Groq Llama 4 Scout | $0.11 | $0.34 | No | Fastest | Good for simple tasks |
| DeepSeek V3.2 | $0.28 | $0.42 | No | Medium | Very good |

GPT-5 Mini is **4x cheaper than Claude Haiku** on input and **2.5x cheaper** on output, with comparable quality for structured tasks (parsing, summarization, content generation). It also has vision capability (needed for OCR). DeepSeek V3.2 is slightly cheaper on output but lacks vision.

**Groq for voice**: Groq's Whisper is the fastest transcription service available (sub-second for 30-second audio clips). After transcription, the text goes to GPT-5 Mini or Groq Llama for parsing. Groq Llama is used when the task is simple (intent detection, entity extraction) and speed matters more than nuance.

### 2.2 Cost Per Feature (Per Invocation)

| Feature | Model | Tokens (in+out) | Cost per Call | Frequency per Merchant/Month |
|---|---|---|---|---|
| **P9** OCR verification | GPT-5 Mini (vision) | ~500+200 | $0.0005 | 50-200 screenshots |
| **O7** Monthly report recommendations | GPT-5 Mini | ~800+300 | $0.0008 | 1 report |
| **O8** Quarterly review | Claude Sonnet 4 | ~2000+500 | $0.014 | 0.33 reports (quarterly) |
| **O10** Payment reminder text | GPT-5 Mini | ~200+100 | $0.0003 | 5-20 reminders |
| **M6** Abandoned cart message | GPT-5 Mini | ~200+100 | $0.0003 | 10-30 messages |
| **M7** Post-sale follow-up | GPT-5 Mini | ~200+100 | $0.0003 | 50-200 messages |
| **A2** Daily briefing | GPT-5 Mini | ~500+300 | $0.0007 | 30 briefings |
| **A3** Smart feed suggestions | GPT-5 Mini | ~400+200 | $0.0005 | 60 refreshes (2/day) |
| **A4** Sales Agent suggestion | GPT-5 Mini | ~300+150 | $0.0004 | 30-60 suggestions |
| **A5** Finance Agent summary | GPT-5 Mini | ~500+200 | $0.0005 | 30 summaries |
| **A6** Content Agent (descriptions) | GPT-5 Mini | ~300+200 | $0.0005 | 10-20 generations |
| **A7** Support Agent Q&A | GPT-5 Mini | ~400+200 | $0.0005 | 30-60 questions |
| **A9** Voice command (transcription) | Groq Whisper | ~30 sec audio | $0.0005 | 30-100 commands |
| **A9** Voice command (parsing) | Groq Llama 4 | ~200+100 | $0.00005 | 30-100 commands |
| **C11/X3** Column mapping (import) | GPT-5 Mini | ~300+150 | $0.0004 | 1-3 imports |

---

## 3. Monthly LLM Cost Projection

### 3.1 Per Merchant (Average Active Merchant on Pro Plan)

| Category | Calls/Month | Avg Cost/Call | Monthly Cost |
|---|---|---|---|
| OCR verification (P9) | 100 | $0.0005 | $0.05 |
| Daily briefing (A2) | 30 | $0.0007 | $0.02 |
| Smart feed (A3) | 60 | $0.0005 | $0.03 |
| Sales Agent (A4) | 40 | $0.0004 | $0.02 |
| Finance Agent (A5) | 30 | $0.0005 | $0.02 |
| Content Agent (A6) | 15 | $0.0005 | $0.01 |
| Support Agent Q&A (A7) | 40 | $0.0005 | $0.02 |
| WhatsApp messages (M6+M7) | 50 | $0.0003 | $0.02 |
| Payment reminders (O10) | 10 | $0.0003 | $0.003 |
| Monthly report (O7) | 1 | $0.0008 | $0.001 |
| Voice commands (A9) | 30 | $0.0005 | $0.02 |
| Import mapping (C11) | 1 | $0.0004 | $0.0004 |
| **Total per merchant** | **~407 calls** | | **$0.21/month** |

**$0.21 per merchant per month in LLM costs.** On a $15/month Pro plan, that's 1.4% of revenue. On a $8 Starter plan (fewer agent features), it's even less.

### 3.2 Platform Level

| Scale | Merchants | LLM Cost/Month | Revenue/Month | LLM as % of Revenue |
|---|---|---|---|---|
| 200 users | 200 | $42 | $1,340 | 3.1% |
| 1,000 users | 1,000 | $210 | $7,500 | 2.8% |
| 5,000 users | 5,000 | $1,050 | $37,500 | 2.8% |
| 25,000 users | 25,000 | $5,250 | $187,500 | 2.8% |

LLM costs scale linearly with users but stay under 3% of revenue at every scale. This is sustainable.

### 3.3 The Photoroom Cost (Separate from LLM)

Photoroom is the biggest external API cost:

| Scale | Images/Month | Cost ($0.02/image) | As % of Revenue |
|---|---|---|---|
| 200 users | 2,000 | $40 | 3.0% |
| 1,000 users | 10,000 | $200 | 2.7% |
| 5,000 users | 50,000 | $1,000 | 2.7% |

Combined LLM + Photoroom stays under 6% of revenue. Healthy margins.

---

## 4. Pre-Development Checklist

> **See [doc 09 — Catalog Edge & Pre-Dev Checklist](09-CATALOG-EDGE-DEPLOYMENT-PREDEV-CHECKLIST.md), section 2** for the complete pre-development checklist with founder decisions, account setup, design artifacts, development environment setup, server provisioning, and day-by-day timeline.

---

## Appendix: Complete Classification Summary

| Type | Count | % of Total | Cost |
|---|---|---|---|
| **Deterministic** | 73 | 82% | $0 (just server compute) |
| **LLM-Powered** | 13 | 15% | ~$0.21/merchant/month |
| **External API** | 3 | 3% | ~$0.40/merchant/month (mostly Photoroom) |
| **Total** | **89** | 100% | **~$0.61/merchant/month** |

82% of Nova is pure code. The AI is concentrated in the agent layer (Module 8) and sprinkled lightly across OCR, content generation, and data import. The system works without AI — the AI makes it exceptional.
