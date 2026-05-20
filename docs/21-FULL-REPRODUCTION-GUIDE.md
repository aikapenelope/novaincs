# Nova — Full Reproduction Guide

> **Purpose**: Recreate the entire Nova stack from zero on a new VPS.  
> **Last Verified**: May 2026  
> **Time to Complete**: ~45 minutes (including DNS propagation)

---

## Prerequisites

Before starting, you need:

| Item | Where to get it |
|------|----------------|
| Hetzner Cloud account | https://console.hetzner.cloud |
| Cloudflare account (DNS) | https://dash.cloudflare.com |
| Clerk account (auth) | https://dashboard.clerk.com |
| OpenRouter API key (LLM) | https://openrouter.ai/keys |
| Groq API key (fast LLM) | https://console.groq.com |
| fal.ai API key (images) | https://fal.ai/dashboard/keys |
| GitHub account with repo access | https://github.com/aikapenelope/novaincs |
| Tailscale account | https://login.tailscale.com |
| Domain (martes.app or your own) | Your registrar |

Optional:
| Item | Purpose |
|------|---------|
| OpenAI API key | Knowledge base embeddings for agents |
| Pulumi Cloud account | IaC management (alternative to manual) |

---

## Option A: Reproduce with Pulumi (Recommended)

This recreates the Hetzner server with the exact same configuration.

### Step 1: Clone the infra repo

```bash
git clone https://github.com/aikapenelope/qyne-infra.git
cd qyne-infra
npm install
```

### Step 2: Configure Pulumi

```bash
# Login to Pulumi Cloud
pulumi login

# Select or create the stack
pulumi stack select dev
# Or: pulumi stack init dev

# Set the Hetzner Cloud token
pulumi config set hcloud:token <YOUR_HETZNER_TOKEN> --secret

# Optional: restrict SSH to your IPs
pulumi config set --path 'sshAllowedIps[0]' '<YOUR_IP>/32'
```

### Step 3: Deploy

```bash
pulumi up
```

This creates:
- 1x CX43 server (8 vCPU, 16 GB RAM, 160 GB NVMe) in Helsinki
- Private network (10.0.0.0/16) with subnet (10.0.1.0/24)
- Firewall (SSH + HTTP/80 + HTTPS/443)
- ED25519 SSH key pair
- Cloud-init that installs Docker + Coolify + fail2ban

### Step 4: Get the SSH key and server IP

```bash
# Get the server IP
pulumi stack output serverIpv4

# Get the SSH private key (save to file)
pulumi stack output sshPrivateKey --show-secrets > ~/.ssh/nova-key
chmod 600 ~/.ssh/nova-key

# SSH into the server
ssh -i ~/.ssh/nova-key root@$(pulumi stack output serverIpv4)
```

### Step 5: Continue with "Post-Server Setup" below

---

## Option B: Reproduce Manually (Any VPS Provider)

### Step 1: Provision a server

Create a VPS with:
- **OS**: Ubuntu 24.04 LTS
- **CPU**: 4+ vCPU (8 recommended)
- **RAM**: 8+ GB (16 recommended)
- **Disk**: 80+ GB NVMe (160 recommended)
- **Location**: Any (Helsinki for EU, Ashburn for US)
- **Ports open**: 22, 80, 443

### Step 2: SSH into the server and bootstrap

```bash
ssh root@<SERVER_IP>

# Clone the repo
git clone https://github.com/aikapenelope/novaincs.git /opt/nova-src
cd /opt/nova-src

# Run the full bootstrap (installs everything)
sudo bash infra/bootstrap.sh
```

The bootstrap script:
1. Installs Docker, Coolify, Tailscale, fail2ban
2. Generates random passwords for all databases
3. Starts infrastructure containers (3x PostgreSQL, Redis, Prefect)
4. Runs all database migrations (schema, RLS, roles, hardening)
5. Creates the application DB role (`qyne_app`)
6. Sets up automated backup cron jobs
7. Applies security hardening
8. Copies Traefik routing configs

### Step 3: Continue with "Post-Server Setup" below

---

## Post-Server Setup (Both Options)

### 1. Authenticate Tailscale

```bash
tailscale up
```

Follow the URL to authenticate. Note the Tailscale IP (e.g., `100.x.x.x`).

### 2. Configure Coolify

1. Open `http://<TAILSCALE_IP>:8000` in your browser
2. Create an admin account
3. Go to **Settings > GitHub** and connect your GitHub account
4. Grant access to the `aikapenelope/novaincs` repository

### 3. Create Application: API

In Coolify, create a new application:

| Setting | Value |
|---------|-------|
| Source | GitHub: `aikapenelope/novaincs` |
| Branch | `main` |
| Build Pack | Dockerfile |
| Base Directory | `apps/api` |
| Dockerfile Location | `Dockerfile` |
| Port | `3000` |
| Domain | `api.martes.app` (or your domain) |
| Network | Add to `coolify` network |
| Auto Deploy | ON |
| Consistent Container Name | ON |
| Health Check Path | `/health` |
| Health Check Port | `3000` |

**Environment Variables** (Runtime, not Buildtime):

```env
DATABASE_URL=postgresql://qyne_app:<PG_NOVA_APP_PASSWORD>@pg-nova:5432/nova
MIGRATION_DATABASE_URL=postgresql://nova:<PG_NOVA_PASSWORD>@pg-nova:5432/nova
REDIS_URL=redis://:<REDIS_PASSWORD>@nova-redis:6379/0
CLERK_SECRET_KEY=<from Clerk dashboard>
CLERK_PUBLISHABLE_KEY=<from Clerk dashboard>
CORS_ORIGINS=https://app.martes.app,https://martes.app
R2_ACCESS_KEY_ID=<from Cloudflare R2>
R2_SECRET_ACCESS_KEY=<from Cloudflare R2>
R2_ENDPOINT=<from Cloudflare R2>
R2_BUCKET=qyne-images
R2_PUBLIC_URL=<from Cloudflare R2>
FAL_KEY=<from fal.ai>
NOVA_INTERNAL_SECRET=<generate with: openssl rand -base64 32>
NODE_ENV=production
PORT=3000
```

### 4. Create Application: Dashboard

| Setting | Value |
|---------|-------|
| Source | GitHub: `aikapenelope/novaincs` |
| Branch | `main` |
| Build Pack | Dockerfile |
| Base Directory | `apps/dashboard` |
| Dockerfile Location | `Dockerfile` |
| Port | `3001` |
| Domain | `app.martes.app` (or your domain) |
| Network | Add to `coolify` network |
| Auto Deploy | ON |
| Consistent Container Name | ON |

**Environment Variables**:

```env
NUXT_PUBLIC_API_URL=https://api.martes.app
NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<from Clerk dashboard>
NUXT_CLERK_SECRET_KEY=<from Clerk dashboard>
NODE_ENV=production
PORT=3001
```

### 5. Create Application: Agents (Agno AgentOS)

| Setting | Value |
|---------|-------|
| Source | GitHub: `aikapenelope/novaincs` |
| Branch | `main` |
| Build Pack | Dockerfile |
| Base Directory | `apps/agents` |
| Dockerfile Location | `Dockerfile` |
| Port | `8100` |
| Domain | None (internal service only) |
| Network | Add to `coolify` network |
| Auto Deploy | ON |
| Consistent Container Name | ON |
| Health Check Path | `/health` |
| Health Check Port | `8100` |
| Health Check Start Period | `120` seconds |

**Environment Variables**:

```env
AGNO_DB_URL=postgresql+psycopg://agno:<PG_AGNO_PASSWORD>@pg-agno:5432/agno
OPENROUTER_API_KEY=<from OpenRouter dashboard>
GROQ_API_KEY=<from Groq console>
NOVA_API_URL=http://<api-container-name>:3000
NOVA_INTERNAL_SECRET=<same value as API's NOVA_INTERNAL_SECRET>
AGENTS_PORT=8100
AGNO_TELEMETRY=false
```

Optional (enables knowledge base embeddings):
```env
OPENAI_API_KEY=<from OpenAI dashboard>
```

> **Note**: `<api-container-name>` is the container name Coolify assigns to the API app.
> Find it with: `docker ps --format '{{.Names}}' | grep -v coolify | grep -v pg | grep -v redis | grep -v prefect`
> It will look like `re6fk4dx8qum7w9v7zh2qer5` (random hash, stable across deploys).

### 6. Configure Traefik Routing

After the first deploy, get the container names:

```bash
docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E '3000|3001'
```

Update the Traefik dynamic configs:

```bash
# Edit with your container names and domains
cat > /data/coolify/proxy/dynamic/qyne-api.yaml << 'EOF'
http:
  routers:
    qyne-api-http:
      rule: "Host(`api.martes.app`)"
      entryPoints:
        - http
      service: qyne-api
    qyne-api-https:
      rule: "Host(`api.martes.app`)"
      entryPoints:
        - https
      service: qyne-api
      tls:
        certResolver: letsencrypt
  services:
    qyne-api:
      loadBalancer:
        servers:
          - url: "http://<API_CONTAINER_NAME>:3000"
EOF

cat > /data/coolify/proxy/dynamic/qyne-dashboard.yaml << 'EOF'
http:
  routers:
    qyne-dashboard-http:
      rule: "Host(`app.martes.app`)"
      entryPoints:
        - http
      service: qyne-dashboard
    qyne-dashboard-https:
      rule: "Host(`app.martes.app`)"
      entryPoints:
        - https
      service: qyne-dashboard
      tls:
        certResolver: letsencrypt
  services:
    qyne-dashboard:
      loadBalancer:
        servers:
          - url: "http://<DASHBOARD_CONTAINER_NAME>:3001"
EOF
```

### 7. Configure DNS (Cloudflare)

Create A records pointing to your server's public IP:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `api.martes.app` | `<SERVER_IP>` | Proxied (orange) |
| A | `app.martes.app` | `<SERVER_IP>` | Proxied (orange) |
| A | `deploy.martes.app` | `<SERVER_IP>` | Proxied (orange) |

### 8. Configure Clerk

1. Go to https://dashboard.clerk.com
2. Create an application (or use existing)
3. Get the **Publishable Key** and **Secret Key**
4. Add them to the API and Dashboard env vars in Coolify
5. Configure allowed redirect URLs:
   - `https://app.martes.app`
   - `http://localhost:3001` (for dev)

### 9. Deploy

Trigger the first deploy in Coolify for all 3 apps, or push to `main`:

```bash
# From your local machine
cd novaincs
git commit --allow-empty -m "trigger deploy"
git push origin main
```

### 10. Verify

```bash
# Health check
curl https://api.martes.app/health

# Expected response:
# {"status":"ok","service":"qyne-api","timestamp":"...","checks":{"pg":{"status":"ok","latencyMs":2},"redis":{"status":"ok","latencyMs":1}}}

# Dashboard
curl -s -o /dev/null -w "%{http_code}" https://app.martes.app/
# Expected: 200

# Agents (internal only, from the server)
docker exec <api-container> curl -sf http://<agents-container>:8100/health
# Expected: {"status":"ok","service":"nova-agents"}
```

---

## Infrastructure State Reference

### Containers (13 total when fully running)

| Container | Image | Port | Purpose |
|-----------|-------|------|---------|
| `<api-hash>` | Built from `apps/api/Dockerfile` | 3000 | Hono API + BullMQ workers |
| `<dashboard-hash>` | Built from `apps/dashboard/Dockerfile` | 3001 | Nuxt 3 SSR dashboard |
| `<agents-hash>` | Built from `apps/agents/Dockerfile` | 8100 | Agno AgentOS (4 AI agents) |
| `pg-nova` | `pgvector/pgvector:0.8.2-pg16` | 5432 | Business data (products, orders, customers) |
| `pg-agno` | `agnohq/pgvector:16` | 5433 | Agent data (memories, sessions, traces) |
| `pg-prefect` | `postgres:16-alpine` | 5434 | Workflow data (flow runs, schedules) |
| `nova-redis` | `redis:7-alpine` | 6379 | Cache + BullMQ queues (4 databases) |
| `nova-prefect` | `prefecthq/prefect:3.6.29-python3.12` | 4200 | Workflow engine |
| `coolify` | Coolify v4.0.0 | 8000 | Deployment platform |
| `coolify-proxy` | Traefik v3 | 80, 443 | Reverse proxy + SSL |
| `coolify-db` | PostgreSQL | — | Coolify internal |
| `coolify-redis` | Redis | — | Coolify internal |
| `coolify-sentinel` | — | — | Coolify monitoring |

### Database Schema (pg-nova)

13 tables with Row-Level Security (RLS):
- `tenants`, `tenant_members` — Multi-tenancy
- `products`, `product_variants` — Catalog
- `categories` — Product organization
- `orders`, `order_items` — Commerce
- `payments` — Payment tracking
- `customers`, `customer_events` — CRM + behavioral tracking
- `inventory_movements` — Stock tracking
- `notifications`, `notification_preferences` — Alerts
- `expenses`, `suppliers` — ERP-lite
- `custom_field_definitions` — Extensible fields
- `plan_tiers`, `billing_events` — Subscription management

Migrations are in `apps/api/drizzle/` (0000 through 0007).

### Cron Jobs

```
0 3 * * *    /opt/nova/backup.sh pg-nova    # Daily at 3:00 AM
30 3 * * 0   /opt/nova/backup.sh pg-agno    # Weekly Sunday at 3:30 AM
```

### BullMQ Workers (run inside API container)

| Worker | Schedule | Purpose |
|--------|----------|---------|
| `image-worker` | On demand | AI image processing (fal.ai) |
| `stock-cleanup` | Every 15 min | Release expired stock reservations |
| `exchange-rate-worker` | Every 15 min | BCV exchange rate refresh |
| `event-worker` | On demand | Behavioral event processing |
| `rfm-scoring` | On demand | Customer RFM recalculation |
| `cart-abandonment` | Periodic | Abandoned cart notifications |
| `payment-ocr` | On demand | Payment screenshot OCR |
| `daily-briefing` | Daily | AI financial briefing generation |
| `feed-generator` | Periodic | Smart feed content generation |

### Pulumi Stack Outputs (qyne-infra/dev)

| Output | Description |
|--------|-------------|
| `serverIpv4` | Public IPv4 of the server |
| `serverIpv6` | Public IPv6 of the server |
| `sshPrivateKey` | ED25519 private key (secret) |
| `dokployUrl` | Coolify panel URL |
| `networkId` | Hetzner private network ID |

### ESC Environments

| Environment | Purpose |
|-------------|---------|
| `qyne-infra/secrets` | Hetzner token for Pulumi |
| `qyne-infra/nova-app` | All application secrets (DB passwords, API keys) |

---

## Secrets Inventory

All secrets that need to be configured for a full deployment:

| Secret | Where Used | How to Generate |
|--------|-----------|-----------------|
| `PG_NOVA_PASSWORD` | pg-nova superuser | `openssl rand -base64 32` |
| `PG_NOVA_APP_PASSWORD` | qyne_app role (API) | `openssl rand -base64 32` |
| `PG_AGNO_PASSWORD` | pg-agno (agents) | `openssl rand -base64 32` |
| `PG_PREFECT_PASSWORD` | pg-prefect (workflows) | `openssl rand -base64 32` |
| `REDIS_PASSWORD` | Redis auth | `openssl rand -base64 32` |
| `NOVA_INTERNAL_SECRET` | Agent-to-API auth | `openssl rand -base64 32` |
| `CLERK_SECRET_KEY` | Clerk auth | From Clerk dashboard |
| `CLERK_PUBLISHABLE_KEY` | Clerk auth (public) | From Clerk dashboard |
| `OPENROUTER_API_KEY` | LLM access | From OpenRouter |
| `GROQ_API_KEY` | Fast LLM | From Groq console |
| `FAL_KEY` | Image processing | From fal.ai |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 storage | From Cloudflare |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 storage | From Cloudflare |
| `R2_ENDPOINT` | Cloudflare R2 endpoint | From Cloudflare |
| `R2_PUBLIC_URL` | Public image URL | From Cloudflare |
| `OPENAI_API_KEY` | Embeddings (optional) | From OpenAI |

---

## Troubleshooting

### Containers not starting

```bash
# Check all container status
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Check logs for a specific container
docker logs <container-name> --tail 50
```

### API returns 503

1. Check if pg-nova is healthy: `docker exec pg-nova pg_isready -U nova`
2. Check if Redis is healthy: `docker exec nova-redis redis-cli -a <password> ping`
3. Check API logs: `docker logs <api-container> --tail 20`

### Agents container keeps restarting

1. Check if pg-agno is healthy: `docker exec pg-agno pg_isready -U agno`
2. Check if `AGNO_DB_URL` is correct in Coolify env vars
3. Check logs: `docker logs <agents-container> --tail 50`
4. Agno needs 60-120s to start (knowledge indexing). Wait for health check.

### Traefik returns 404

1. Verify Traefik dynamic configs exist: `ls /data/coolify/proxy/dynamic/`
2. Check container names match the configs: `docker ps --format '{{.Names}}'`
3. Verify DNS is pointing to the correct IP: `dig api.martes.app`

### Database migrations fail

```bash
# Run migrations manually
docker exec -i pg-nova psql -U nova -d nova < apps/api/drizzle/0004_feed_notifications.sql
```

---

## Destroying the Current Server

Before destroying, ensure you have:

1. **Backup of pg-nova** (business data):
   ```bash
   ssh root@<SERVER_IP> "docker exec pg-nova pg_dump -U nova -d nova" > nova-backup-$(date +%Y%m%d).sql
   ```

2. **Backup of pg-agno** (agent memories):
   ```bash
   ssh root@<SERVER_IP> "docker exec pg-agno pg_dump -U agno -d agno" > agno-backup-$(date +%Y%m%d).sql
   ```

3. **Note all Coolify env vars** (or they're in Pulumi ESC `qyne-infra/nova-app`)

4. **Destroy via Pulumi** (if using Option A):
   ```bash
   cd qyne-infra
   pulumi destroy
   ```

   Or manually delete the server in Hetzner Cloud console.

---

## Restoring from Backup

After setting up a new server and running bootstrap:

```bash
# Restore pg-nova
cat nova-backup-YYYYMMDD.sql | docker exec -i pg-nova psql -U nova -d nova

# Restore pg-agno
cat agno-backup-YYYYMMDD.sql | docker exec -i pg-agno psql -U agno -d agno
```

Then deploy the apps via Coolify (they'll connect to the restored databases).
