# Qyne — Infrastructure

Server infrastructure for the Qyne platform. Runs on Hetzner Cloud CX43 (8 vCPU, 16 GB RAM, Helsinki).

## Architecture

```
VPS (204.168.169.254 / Tailscale: 100.123.199.40)
├── Coolify (deploy panel + Traefik proxy)     → deploy.martes.app
├── qyne-api (Hono, deployed by Coolify)       → api.martes.app
├── qyne-dashboard (Nuxt 3, deployed by Coolify) → app.martes.app
├── pg-nova (PostgreSQL 16 + pgvector)         → localhost:5432
├── pg-agno (PostgreSQL 16 + pgvector)         → localhost:5433
├── pg-prefect (PostgreSQL 16)                 → localhost:5434
├── Redis 7                                    → localhost:6379
├── Prefect 3 (workflow engine)                → localhost:4200
├── Tailscale (VPN mesh)
└── fail2ban + SSH hardening
```

## Files

| File | Purpose | Where it runs |
|---|---|---|
| `docker-compose.infra.yml` | Databases, Redis, Prefect | `/opt/nova/` on VPS |
| `backup.sh` | Daily pg_dump for pg-nova, weekly for pg-agno | Cron on VPS |
| `prefect-start.sh` | Prefect server + worker startup | Mounted in Prefect container |
| `prefect-healthcheck.py` | Prefect health check | Mounted in Prefect container |
| `setup.sh` | Bootstrap a fresh VPS (Docker, Coolify, Tailscale) | Run once on new server |
| `harden.sh` | Security hardening (SSH, fail2ban, kernel, logs) | Run after setup |
| `.env.example` | Template for infrastructure secrets | Copy to `.env` on VPS |
| `traefik-dynamic/` | Traefik routing configs (Coolify bug workaround) | `/data/coolify/proxy/dynamic/` |

## Deploy Flow

**App containers** (API + Dashboard) are managed by **Coolify**:
1. Push to `main` on GitHub
2. Coolify receives webhook, builds Docker images, deploys
3. Traefik routes traffic via file provider configs

**Infrastructure containers** (DBs, Redis, Prefect) are managed by **Docker Compose**:
```bash
cd /opt/nova
docker compose -f docker-compose.infra.yml up -d
```

## First-Time Setup

```bash
# 1. Provision server via Pulumi (qyne-infra repo)
pulumi up

# 2. Bootstrap the server
ssh root@<server-ip> 'bash -s' < infra/setup.sh

# 3. Authenticate Tailscale
ssh root@<server-ip> tailscale up

# 4. Apply security hardening
ssh root@<server-ip> 'bash -s' < infra/harden.sh

# 5. Copy .env and start infra
scp infra/.env.example root@<server-ip>:/opt/nova/.env
# Edit .env with real passwords
ssh root@<server-ip> 'cd /opt/nova && docker compose -f docker-compose.infra.yml up -d'

# 6. Copy Traefik configs
scp infra/traefik-dynamic/*.yaml root@<server-ip>:/data/coolify/proxy/dynamic/

# 7. Configure Coolify at https://deploy.martes.app
# Connect GitHub, create apps, set environment variables
```

## Traefik Routing (Coolify Bug Workaround)

Coolify v4.0.0 has a known bug generating incorrect Traefik Docker labels.
We use Traefik's File provider as the authoritative routing config.
See `docs/50-COOLIFY-TRAEFIK-ROUTING.md` for full details.

The configs in `traefik-dynamic/` are copied to `/data/coolify/proxy/dynamic/` on the VPS.
Container names are stable (`is_consistent_container_name_enabled = true` in Coolify).
