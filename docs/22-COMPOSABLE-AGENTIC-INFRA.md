# Nova — Composable Agentic Infrastructure

> **Status**: Active  
> **Last Updated**: May 2026  
> **Scope**: Architecture documentation for the self-deploying, composable infrastructure stack that powers Nova and can be replicated for any agentic project.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GITHUB (Source of Truth)                      │
│                                                                       │
│  Push to main ──→ CI (lint/typecheck/test) ──→ CD (build images)     │
│                                                    │                  │
│                                              ┌─────▼─────┐           │
│                                              │   GHCR     │           │
│                                              │ (3 images) │           │
│                                              └─────┬─────┘           │
└────────────────────────────────────────────────────┼─────────────────┘
                                                     │ poll every 5 min
┌────────────────────────────────────────────────────▼─────────────────┐
│                           VPS (Any Provider)                          │
│                                                                       │
│  ┌─────────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────┐    │
│  │  Traefik    │  │   API    │  │ Dashboard │  │   Agents     │    │
│  │  (proxy)    │  │  (Hono)  │  │  (Nuxt)   │  │  (Agno)      │    │
│  │  :80/:443   │  │  :3000   │  │  :3001    │  │  :8100       │    │
│  └──────┬──────┘  └────┬─────┘  └───────────┘  └──────┬───────┘    │
│         │               │                               │            │
│         │         ┌─────▼─────────────────────────────▼────┐        │
│         │         │           Docker Network (internal)      │        │
│         │         │                                          │        │
│         │         │  ┌────────┐ ┌────────┐ ┌─────┐ ┌─────┐│        │
│         │         │  │pg-nova │ │pg-agno │ │Redis│ │Prfct││        │
│         │         │  │(biz)   │ │(agents)│ │     │ │     ││        │
│         │         │  └────────┘ └────────┘ └─────┘ └─────┘│        │
│         │         └──────────────────────────────────────────┘        │
│         │                                                             │
│  ┌──────▼──────┐                                                     │
│  │ Watchtower  │ ← Monitors GHCR, auto-pulls new images              │
│  └─────────────┘                                                     │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 2. Design Principles

### 2.1 Layered Independence

The system is designed in layers. Each layer works independently:

| Layer | What it does | Required? |
|-------|-------------|-----------|
| **docker-compose.prod.yml** | Runs everything | YES (base layer) |
| **GitHub Actions CD** | Builds images to GHCR | Optional (can build locally) |
| **Watchtower** | Auto-pulls new images | Optional (can `docker compose pull` manually) |
| **Pulumi** | Creates the VPS | Optional (can use any VPS) |
| **Coolify/Dokploy** | PaaS UI | Optional (can add on top) |

### 2.2 Single Source of Truth

- **Code**: GitHub repo
- **Secrets**: `.env` file on the server (or Pulumi ESC)
- **State**: Docker volumes on the server
- **Images**: GHCR (built by CI/CD)

### 2.3 Zero Manual Steps After Bootstrap

Once `bootstrap-standalone.sh` runs and `.env` is configured:
- Push to `main` = automatic deploy (via Watchtower)
- No SSH needed for deploys
- No UI clicks needed
- No manual docker commands needed

---

## 3. How to Deploy

### First Time (New VPS)

```bash
# 1. Get a VPS (Ubuntu 24.04, 8+ GB RAM, ports 22/80/443 open)

# 2. SSH in and bootstrap
ssh root@<IP>
git clone https://github.com/aikapenelope/novaincs.git /opt/nova
cd /opt/nova
sudo bash infra/bootstrap-standalone.sh

# 3. Edit secrets
nano .env  # Add API keys, domains, etc.

# 4. Authenticate with GHCR
echo $GHCR_TOKEN | docker login ghcr.io -u $GHCR_USER --password-stdin

# 5. Start everything
docker compose -f docker-compose.prod.yml up -d

# 6. Configure DNS (A records → server IP)
# Done. System is live.
```

### Subsequent Deploys

```bash
# Automatic: just push to main
git push origin main
# → CI → CD → GHCR → Watchtower pulls → containers restart

# Manual (if needed):
ssh root@<IP>
cd /opt/nova
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### With Pulumi (Automates VPS Creation)

```bash
cd qyne-infra
pulumi config set hcloud:token <TOKEN> --secret
pulumi config set --secret ghcrUser <user>
pulumi config set --secret ghcrToken <pat>
pulumi up
# Server created + bootstrapped automatically via cloud-init
```

---

## 4. How to Replicate for Another Project

The stack is designed to be copied and adapted. Here's what to change:

### Step 1: Fork the Pattern

```bash
# Copy these files to your new project:
docker-compose.prod.yml          # Change image names
.github/workflows/ci.yml         # Adapt to your language/framework
.github/workflows/cd.yml         # Change GHCR image paths
infra/bootstrap-standalone.sh    # Change repo URL
infra/traefik-dynamic/           # Change domains
apps/agents/                     # Rewrite agents for your domain
```

### Step 2: Adapt the Agents

```
apps/agents/
├── src/
│   ├── config.py          ← Keep as-is (generic: models, DB, knowledge)
│   ├── shared.py          ← Keep as-is (generic: guardrails, learning, compression)
│   ├── agents/            ← REWRITE for your domain
│   │   ├── __init__.py
│   │   └── your_agent.py  # New agent with your instructions
│   └── tools/             ← REWRITE for your API
│       ├── api_client.py  ← Keep as-is (generic HTTP client)
│       └── your_tools.py  # New tools that call your API
├── Dockerfile             ← Keep as-is
└── pyproject.toml         ← Keep as-is
```

### Step 3: Adapt the API

Replace `apps/api/` with your own backend. The agents only need:
- An HTTP API with endpoints they can call
- `NOVA_INTERNAL_SECRET` for service-to-service auth
- A health check at `/health`

### Step 4: Deploy

Same process: bootstrap → .env → docker compose up → done.

---

## 5. Project Ideas for This Stack

The composable agentic infrastructure works for any project that needs:
- A web API + frontend
- AI agents that act on business data
- Background job processing
- Multi-tenant isolation

### 5.1 Clinic/Medical Practice Manager

**Domain**: Small clinics in LATAM that manage appointments, patients, and billing via WhatsApp.

**Agents**:
- **Scheduling Agent**: Manages appointment calendar, detects conflicts, suggests optimal slots
- **Patient Agent**: Answers patient questions about their history, medications, next appointments
- **Billing Agent**: Tracks payments, generates invoices, sends reminders
- **Triage Agent**: Pre-screens patient symptoms via WhatsApp before appointment

**What changes**: Schema (patients, appointments, prescriptions), agent instructions, tools that query medical data.

**What stays the same**: Infra (PostgreSQL, Redis, Agno), auth pattern, deploy pipeline, Traefik routing.

### 5.2 Real Estate Agency Platform

**Domain**: Real estate agents managing listings, leads, and showings.

**Agents**:
- **Listing Agent**: Generates property descriptions from photos, suggests pricing based on comparables
- **Lead Qualifier**: Scores incoming leads based on budget, timeline, preferences
- **Showing Coordinator**: Schedules viewings, sends reminders, collects feedback
- **Market Analyst**: Tracks price trends, alerts on opportunities

**What changes**: Schema (properties, leads, showings), image processing (property photos), agent tools.

### 5.3 Restaurant/Dark Kitchen Operations

**Domain**: Multi-location restaurants managing orders, inventory, and staff.

**Agents**:
- **Order Agent**: Processes delivery platform orders, routes to correct kitchen
- **Inventory Agent**: Tracks ingredient levels, auto-generates purchase orders
- **Menu Optimizer**: Analyzes sales data, suggests menu changes, prices
- **Review Agent**: Monitors Google/Uber Eats reviews, drafts responses, flags issues

**What changes**: Schema (menus, ingredients, orders, locations), integrations (Uber Eats, Rappi APIs).

### 5.4 Freelancer/Agency Project Manager

**Domain**: Freelancers and small agencies managing clients, projects, and invoicing.

**Agents**:
- **Project Agent**: Tracks deadlines, suggests task prioritization, detects scope creep
- **Client Agent**: Drafts proposals, follow-up emails, status updates
- **Finance Agent**: Tracks hours, generates invoices, monitors cash flow
- **Content Agent**: Generates social proof (case studies, testimonials) from project data

**What changes**: Schema (projects, tasks, clients, time entries), integrations (calendar, email).

### 5.5 E-learning Platform

**Domain**: Course creators selling online courses with AI tutoring.

**Agents**:
- **Tutor Agent**: Answers student questions about course material, adapts explanations
- **Progress Agent**: Tracks student progress, identifies struggling students, suggests interventions
- **Content Agent**: Generates quizzes, summaries, flashcards from course material
- **Sales Agent**: Identifies upsell opportunities, drafts promotional emails

**What changes**: Schema (courses, lessons, enrollments, progress), knowledge base (course content as vectors).

### 5.6 Logistics/Delivery Coordinator

**Domain**: Small delivery companies managing routes, drivers, and packages.

**Agents**:
- **Route Agent**: Optimizes delivery routes, handles re-routing on failures
- **Customer Agent**: Sends tracking updates, handles delivery issues via WhatsApp
- **Fleet Agent**: Monitors driver availability, suggests shift assignments
- **Analytics Agent**: Tracks delivery times, identifies bottlenecks, suggests improvements

**What changes**: Schema (packages, routes, drivers, zones), real-time tracking, map integrations.

### 5.7 Legal Practice Assistant

**Domain**: Small law firms managing cases, documents, and client communication.

**Agents**:
- **Research Agent**: Searches legal databases, summarizes relevant precedents
- **Document Agent**: Drafts contracts, letters, motions from templates + context
- **Calendar Agent**: Manages court dates, filing deadlines, client meetings
- **Billing Agent**: Tracks billable hours, generates invoices, monitors receivables

**What changes**: Schema (cases, documents, deadlines, billing), knowledge base (legal templates), document generation.

---

## 6. What Makes This Stack Reusable

| Component | Why it's generic |
|-----------|-----------------|
| `docker-compose.prod.yml` | Any app that needs DB + cache + reverse proxy |
| `apps/agents/config.py` | Configures LLM models via env vars (any provider) |
| `apps/agents/shared.py` | Guardrails + learning + compression (domain-agnostic) |
| `tools/api_client.py` | Generic httpx client (just change base URL) |
| `bootstrap-standalone.sh` | Works on any Ubuntu VPS |
| `.github/workflows/cd.yml` | Builds any Dockerfile to GHCR |
| Watchtower | Auto-updates any Docker container |
| Traefik | Routes any domain to any container |

The **only things that change per project** are:
1. Database schema (what data you store)
2. API routes (what endpoints exist)
3. Agent instructions (what the AI knows/does)
4. Agent tools (what the AI can query/act on)
5. Frontend (what users see)

The infrastructure, deploy pipeline, observability, and agent runtime stay the same.

---

## 7. Cost per Project

| Component | Monthly Cost |
|-----------|-------------|
| Hetzner CX43 (8 vCPU, 16 GB) | ~$16 |
| Domain | ~$1 |
| GHCR (free for public repos) | $0 |
| GitHub Actions (2,000 min/mo free) | $0 |
| OpenRouter (LLM, pay-per-use) | ~$5-50 |
| Cloudflare (DNS, free tier) | $0 |
| **Total** | **~$22-67/month** |

One server can run multiple projects if they share the infrastructure layer (PostgreSQL, Redis, Traefik). Each project just adds its own containers and database.
