# Nova — Infrastructure

Everything needed to deploy Nova on any Ubuntu 24.04 VPS. This directory is independent of Pulumi — you can use it to replicate the infrastructure manually on any server.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    VPS (8 vCPU, 16 GB RAM)               │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐                     │
│  │  nova-api    │  │  nova-dash   │                     │
│  │  Hono+BullMQ │  │  Nuxt 3 SSR  │                     │
│  │  :3000       │  │  :3001       │                     │
│  └──────┬───────┘  └──────────────┘                     │
│         │                                                │
│  ┌──────┴───────┐  ┌──────────────┐                     │
│  │ nova-agents  │  │   prefect    │                     │
│  │ Agno AgentOS │  │  server +    │                     │
│  │  :8000       │  │  worker      │                     │
│  └──────────────┘  └──────────────┘                     │
│                                                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│  │  pg-nova   │ │  pg-agno   │ │ pg-prefect │          │
│  │  :5432     │ │  :5433     │ │  :5434     │          │
│  │  Business  │ │  Agents    │ │  Workflows │          │
│  └────────────┘ └────────────┘ └────────────┘          │
│                                                          │
│  ┌────────────┐  ┌──────────────────────────┐           │
│  │   redis    │  │  Dokploy + Traefik       │           │
│  │   :6379    │  │  (SSL, routing, deploy)  │           │
│  └────────────┘  └──────────────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

8 containers, 3 PostgreSQL instances, 1 Redis. Each service isolated. See [docs/12-COMPLETE-STACK-EXPLAINED.md](../docs/12-COMPLETE-STACK-EXPLAINED.md) for the full rationale.

## Requirements

- **OS**: Ubuntu 24.04 LTS
- **CPU**: 8 vCPU minimum
- **RAM**: 16 GB minimum (8 GB used by containers, 8 GB headroom)
- **Disk**: 160 GB NVMe (server) + 100 GB block storage (recommended for databases)
- **Ports**: 22 (SSH), 80 (HTTP), 443 (HTTPS), 3000 (Dokploy UI)

Tested on Hetzner CX43. Works on any VPS provider (DigitalOcean, Vultr, Linode, OVH, etc.).

## Quick Start

### 1. Provision a VPS

Any Ubuntu 24.04 server with 8 vCPU / 16 GB RAM. If the provider offers block storage, attach a 100 GB volume — the setup script will detect it automatically.

### 2. Run the setup script

```bash
ssh root@your-server 'bash -s' < setup.sh
```

This installs Docker, Dokploy (with Traefik), and creates the data directories. If block storage is mounted at `/mnt/storage`, databases use it. Otherwise, they use `/var/lib/nova` on the server disk.

### 3. Configure environment variables

```bash
cp .env.example .env
nano .env   # fill in all secrets
```

See [.env.example](.env.example) for all required variables and descriptions.

### 4. Deploy containers

```bash
cd infra
docker compose up -d
```

### 5. Configure Dokploy

Open `http://your-server-ip:3000`, create the admin account, and configure:
- Domain name (e.g., `nova.app`)
- SSL certificates (automatic via Let's Encrypt through Traefik)
- Git deploy for the application containers

## Files

| File | Purpose |
|---|---|
| `docker-compose.yml` | Production container definitions (8 services) |
| `setup.sh` | Server bootstrap: Docker + Dokploy + data directories |
| `.env.example` | Template with all required environment variables |
| `README.md` | This file |

## Data Storage

### With block storage (recommended)

```
/mnt/storage/
├── pg-nova/     # Business data (products, orders, customers, RLS)
├── pg-agno/     # Agent data (memories, sessions, traces, vectors)
└── backups/     # pg_dump destination
```

pg-prefect and redis use Docker volumes on the server disk (their data is operational and regenerable).

### Without block storage

The setup script falls back to `/var/lib/nova/` on the server disk. Everything works the same, but you lose the ability to expand storage independently or survive a server recreation.

## Memory Budget

| Container | RAM | Notes |
|---|---|---|
| Dokploy + Traefik | 350 MB | Deployment management + reverse proxy |
| nova-api | 1,000 MB | Hono API + BullMQ workers |
| nova-dashboard | 512 MB | Nuxt 3 SSR |
| nova-agents | 1,000 MB | Agno AgentOS (Python) |
| prefect | 512 MB | Workflow orchestration |
| pg-nova | 2,000 MB | Business database |
| pg-agno | 512 MB | Agent database |
| pg-prefect | 256 MB | Prefect database |
| redis | 512 MB | Cache + queues |
| OS + Docker | 500 MB | Kernel, Docker daemon |
| **Total** | **~7.1 GB** | **~8.9 GB free for headroom** |

## Backups

- **Hetzner automated backups**: Enable in the Hetzner console (covers the full server disk).
- **pg_dump**: Schedule daily dumps to `/mnt/storage/backups/` (or `/var/lib/nova/backups/`):

```bash
# Add to crontab on the host
0 3 * * * docker exec pg-nova pg_dump -U nova nova | gzip > /mnt/storage/backups/nova-$(date +\%Y\%m\%d).sql.gz
0 3 * * 0 docker exec pg-agno pg_dump -U agno agno | gzip > /mnt/storage/backups/agno-$(date +\%Y\%m\%d).sql.gz
```

## Replicating to Another VPS

To deploy Nova on a different server (different provider, region, etc.):

1. Provision a new VPS (Ubuntu 24.04, 8 vCPU, 16 GB RAM)
2. (Optional) Attach block storage, format as ext4, mount at `/mnt/storage`
3. Run `setup.sh` on the new server
4. Copy `.env` to the new server
5. Run `docker compose up -d`
6. Restore database backups if migrating data:
   ```bash
   gunzip -c nova-YYYYMMDD.sql.gz | docker exec -i pg-nova psql -U nova nova
   gunzip -c agno-YYYYMMDD.sql.gz | docker exec -i pg-agno psql -U agno agno
   ```
7. Update DNS to point to the new server IP

No Pulumi, no Terraform, no cloud-specific tooling required. Just Docker Compose.

## Scaling Path

| Merchants | Infrastructure | Approx. Cost |
|---|---|---|
| 0–3,000 | 1x CX43 (8 vCPU, 16 GB) | ~€24/mo |
| 3,000–8,000 | 1x CX53 (16 vCPU, 32 GB) | ~€45/mo |
| 8,000–25,000 | 2 servers (app + databases) | ~€80/mo |
| 25,000–100,000 | 3 servers (app + DB primary + replica) | ~€150/mo |

No architectural rewrites needed. Each upgrade is: more RAM, more CPU, or separate a service to its own server.
