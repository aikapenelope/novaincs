# Qyne — Infrastructure

Server infrastructure for the Qyne platform.

## Quick Deploy (New Server)

```bash
# On a fresh Ubuntu 24.04 VPS with root access:
git clone https://github.com/aikapenelope/novaincs.git
cd novaincs
sudo bash infra/bootstrap.sh
```

This single command:

1. Installs Docker, Coolify, Tailscale, fail2ban
2. Generates all passwords automatically
3. Starts PostgreSQL (x3), Redis, Prefect
4. Runs all database migrations (schema, RLS, roles, constraints)
5. Creates the `qyne_app` DB role with password
6. Sets up daily backup cron
7. Applies SSH + kernel security hardening
8. Copies Traefik routing configs

After the script finishes, follow the printed instructions to:

- Authenticate Tailscale (`tailscale up`)
- Configure Coolify (connect GitHub, create apps)
- Set DNS records
- Add Clerk API keys

## Architecture

```
VPS
├── Coolify (deploy panel + Traefik proxy)
├── qyne-api (Hono, deployed by Coolify)        → api.yourdomain.com
├── qyne-dashboard (Nuxt 3, deployed by Coolify) → app.yourdomain.com
├── pg-nova (PostgreSQL 16 + pgvector)           → localhost:5432
├── pg-agno (PostgreSQL 16 + pgvector)           → localhost:5433
├── pg-prefect (PostgreSQL 16)                   → localhost:5434
├── Redis 7                                      → localhost:6379
├── Prefect 3 (workflow engine)                  → localhost:4200
├── Tailscale (VPN mesh)
└── fail2ban + SSH hardening
```

## Files

| File                       | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `bootstrap.sh`             | **One-command full deploy** — runs everything below in order   |
| `setup.sh`                 | System packages, Docker, Coolify, Tailscale                    |
| `harden.sh`                | SSH hardening, fail2ban, kernel, Docker log rotation           |
| `docker-compose.infra.yml` | Databases, Redis, Prefect with resource limits                 |
| `.env.example`             | Template for secrets (bootstrap generates these automatically) |
| `backup.sh`                | Daily pg_dump for pg-nova, weekly for pg-agno                  |
| `prefect-start.sh`         | Prefect server + worker startup                                |
| `prefect-healthcheck.py`   | Prefect health check                                           |
| `deploy.sh`                | Manual deploy script (alternative to Coolify auto-deploy)      |
| `traefik-dynamic/`         | Traefik routing configs (Coolify bug workaround)               |

## Deploy Flow

**Infrastructure** (DBs, Redis, Prefect) is managed by Docker Compose:

```bash
cd /opt/nova && docker compose up -d
```

**App containers** (API + Dashboard) are managed by Coolify:

1. Push to `main` on GitHub
2. Coolify receives webhook, builds Docker images, deploys
3. Traefik routes traffic via file provider configs

## Requirements

- Ubuntu 24.04 LTS
- Root access
- Minimum 4 vCPU, 8 GB RAM (recommended: 8 vCPU, 16 GB)
- Ports 22, 80, 443 open
- A domain with DNS access
- A Clerk account (https://dashboard.clerk.com)
- A Cloudflare R2 bucket (for image storage)
- A fal.ai account (for AI image processing)
